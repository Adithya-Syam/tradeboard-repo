/**
 * Paper-trading engine.
 *
 * Every function here is pure: it takes the current account state and returns
 * a new one, which keeps the logic easy to test and to persist (local or Supabase).
 *
 * Rules (spot trading, no leverage, no shorting):
 * - Market orders fill immediately at the current price.
 * - Buy limit orders fill when the price drops to or below the limit; sell limit
 *   orders fill when the price rises to or above it. Fills happen at the limit price.
 * - Open buy limits reserve cash and open sell limits reserve quantity, so the
 *   same funds can't be committed twice.
 */
import type { AccountState, Order, OrderType, Position, Side } from "./types";

export const STARTING_CASH = 100_000;
export const DEFAULT_WATCHLIST = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "ADAUSDT",
  "DOGEUSDT",
  "AVAXUSDT",
];

/** Tolerance for floating-point comparisons on quantities and cash. */
const EPS = 1e-9;

export function initialState(): AccountState {
  return { cash: STARTING_CASH, positions: {}, orders: [], watchlist: [...DEFAULT_WATCHLIST] };
}

export function reservedCash(state: AccountState): number {
  return state.orders
    .filter((o) => o.status === "open" && o.side === "buy")
    .reduce((sum, o) => sum + o.quantity * (o.limitPrice ?? 0), 0);
}

export function reservedQuantity(state: AccountState, symbol: string): number {
  return state.orders
    .filter((o) => o.status === "open" && o.side === "sell" && o.symbol === symbol)
    .reduce((sum, o) => sum + o.quantity, 0);
}

export function availableCash(state: AccountState): number {
  return state.cash - reservedCash(state);
}

export function availableQuantity(state: AccountState, symbol: string): number {
  return (state.positions[symbol]?.quantity ?? 0) - reservedQuantity(state, symbol);
}

export interface OrderRequest {
  symbol: string;
  side: Side;
  type: OrderType;
  quantity: number;
  limitPrice?: number;
}

export type ValidationResult = { ok: true } | { ok: false; error: string };

export function validateOrder(
  state: AccountState,
  req: OrderRequest,
  marketPrice: number | undefined,
): ValidationResult {
  if (!Number.isFinite(req.quantity) || req.quantity <= 0) {
    return { ok: false, error: "Quantity must be greater than zero." };
  }
  if (req.type === "limit" && (!Number.isFinite(req.limitPrice) || (req.limitPrice ?? 0) <= 0)) {
    return { ok: false, error: "Enter a valid limit price." };
  }
  if (req.type === "market" && !(marketPrice && marketPrice > 0)) {
    return { ok: false, error: "No live price yet. Try again in a moment." };
  }
  const price = req.type === "market" ? marketPrice! : req.limitPrice!;
  if (req.side === "buy") {
    const cost = req.quantity * price;
    if (cost > availableCash(state) + EPS) {
      return { ok: false, error: `Insufficient funds: need ${fmt(cost)} USDT, have ${fmt(availableCash(state))}.` };
    }
  } else {
    const avail = availableQuantity(state, req.symbol);
    if (req.quantity > avail + EPS) {
      return { ok: false, error: `Insufficient ${baseAsset(req.symbol)}: have ${avail} available.` };
    }
  }
  return { ok: true };
}

/** Apply a fill to cash and positions. Assumes the order was already validated. */
function applyFill(state: AccountState, symbol: string, side: Side, qty: number, price: number): AccountState {
  const positions = { ...state.positions };
  const existing: Position | undefined = positions[symbol];
  let cash = state.cash;

  if (side === "buy") {
    cash -= qty * price;
    const prevQty = existing?.quantity ?? 0;
    const newQty = prevQty + qty;
    const avgPrice = ((existing?.avgPrice ?? 0) * prevQty + price * qty) / newQty;
    positions[symbol] = { symbol, quantity: newQty, avgPrice };
  } else {
    cash += qty * price;
    const remaining = (existing?.quantity ?? 0) - qty;
    if (remaining <= EPS) delete positions[symbol];
    else positions[symbol] = { ...existing!, quantity: remaining };
  }
  return { ...state, cash, positions };
}

export function placeOrder(
  state: AccountState,
  req: OrderRequest,
  marketPrice: number | undefined,
  id: string,
  now: string,
): { state: AccountState; order: Order } {
  const base: Order = {
    id,
    symbol: req.symbol,
    side: req.side,
    type: req.type,
    quantity: req.quantity,
    limitPrice: req.type === "limit" ? req.limitPrice : undefined,
    status: "open",
    createdAt: now,
    updatedAt: now,
  };

  const check = validateOrder(state, req, marketPrice);
  if (!check.ok) {
    const order: Order = { ...base, status: "rejected", note: check.error };
    return { state: { ...state, orders: [order, ...state.orders] }, order };
  }

  if (req.type === "market") {
    const filled = applyFill(state, req.symbol, req.side, req.quantity, marketPrice!);
    const order: Order = { ...base, status: "filled", filledPrice: marketPrice };
    return { state: { ...filled, orders: [order, ...state.orders] }, order };
  }

  // A limit order that is already marketable fills straight away at the limit price.
  const withOrder: AccountState = { ...state, orders: [base, ...state.orders] };
  if (marketPrice !== undefined) {
    const next = matchLimitOrders(withOrder, { [req.symbol]: marketPrice }, now);
    return { state: next, order: next.orders.find((o) => o.id === id)! };
  }
  return { state: withOrder, order: base };
}

export function cancelOrder(state: AccountState, id: string, now: string): AccountState {
  return {
    ...state,
    orders: state.orders.map((o) =>
      o.id === id && o.status === "open" ? { ...o, status: "cancelled", updatedAt: now } : o,
    ),
  };
}

function isTriggered(order: Order, price: number): boolean {
  if (order.limitPrice === undefined) return false;
  return order.side === "buy" ? price <= order.limitPrice : price >= order.limitPrice;
}

/** Fill any open limit orders whose trigger price has been reached. */
export function matchLimitOrders(
  state: AccountState,
  prices: Record<string, number>,
  now: string,
): AccountState {
  const triggered = state.orders.filter(
    (o) => o.status === "open" && prices[o.symbol] !== undefined && isTriggered(o, prices[o.symbol]),
  );
  if (triggered.length === 0) return state;

  let next = state;
  // Process oldest first, like a real matching engine's time priority.
  for (const order of [...triggered].reverse()) {
    const price = order.limitPrice!;
    next = applyFill(next, order.symbol, order.side, order.quantity, price);
    next = {
      ...next,
      orders: next.orders.map((o) =>
        o.id === order.id ? { ...o, status: "filled", filledPrice: price, updatedAt: now } : o,
      ),
    };
  }
  return next;
}

export interface PortfolioSummary {
  cash: number;
  holdingsValue: number;
  equity: number;
  unrealizedPnl: number;
  totalReturnPct: number;
}

export function summarize(state: AccountState, prices: Record<string, number>): PortfolioSummary {
  let holdingsValue = 0;
  let costBasis = 0;
  for (const p of Object.values(state.positions)) {
    const price = prices[p.symbol] ?? p.avgPrice;
    holdingsValue += p.quantity * price;
    costBasis += p.quantity * p.avgPrice;
  }
  const equity = state.cash + holdingsValue;
  return {
    cash: state.cash,
    holdingsValue,
    equity,
    unrealizedPnl: holdingsValue - costBasis,
    totalReturnPct: ((equity - STARTING_CASH) / STARTING_CASH) * 100,
  };
}

export function baseAsset(symbol: string): string {
  return symbol.replace(/USDT$/, "");
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
