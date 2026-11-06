import { describe, expect, it } from "vitest";
import {
  STARTING_CASH,
  availableCash,
  availableQuantity,
  cancelOrder,
  initialState,
  matchLimitOrders,
  placeOrder,
  summarize,
} from "@/lib/engine";

const NOW = "2026-01-01T00:00:00.000Z";
let n = 0;
const id = () => `o${++n}`;

describe("market orders", () => {
  it("buys at the market price and updates cash and position", () => {
    const { state, order } = placeOrder(initialState(), { symbol: "BTCUSDT", side: "buy", type: "market", quantity: 0.5 }, 60_000, id(), NOW);
    expect(order.status).toBe("filled");
    expect(order.filledPrice).toBe(60_000);
    expect(state.cash).toBe(STARTING_CASH - 30_000);
    expect(state.positions.BTCUSDT).toEqual({ symbol: "BTCUSDT", quantity: 0.5, avgPrice: 60_000 });
  });

  it("averages the entry price across buys", () => {
    let s = initialState();
    s = placeOrder(s, { symbol: "ETHUSDT", side: "buy", type: "market", quantity: 1 }, 2_000, id(), NOW).state;
    s = placeOrder(s, { symbol: "ETHUSDT", side: "buy", type: "market", quantity: 1 }, 3_000, id(), NOW).state;
    expect(s.positions.ETHUSDT.quantity).toBe(2);
    expect(s.positions.ETHUSDT.avgPrice).toBe(2_500);
  });

  it("closes the position when everything is sold", () => {
    let s = placeOrder(initialState(), { symbol: "SOLUSDT", side: "buy", type: "market", quantity: 10 }, 100, id(), NOW).state;
    s = placeOrder(s, { symbol: "SOLUSDT", side: "sell", type: "market", quantity: 10 }, 120, id(), NOW).state;
    expect(s.positions.SOLUSDT).toBeUndefined();
    expect(s.cash).toBe(STARTING_CASH + 200);
  });

  it("rejects a buy larger than available cash", () => {
    const { state, order } = placeOrder(initialState(), { symbol: "BTCUSDT", side: "buy", type: "market", quantity: 10 }, 60_000, id(), NOW);
    expect(order.status).toBe("rejected");
    expect(order.note).toMatch(/Insufficient funds/);
    expect(state.cash).toBe(STARTING_CASH);
  });

  it("rejects selling an asset you don't hold", () => {
    const { order } = placeOrder(initialState(), { symbol: "BTCUSDT", side: "sell", type: "market", quantity: 1 }, 60_000, id(), NOW);
    expect(order.status).toBe("rejected");
  });

  it("rejects market orders before a price arrives", () => {
    const { order } = placeOrder(initialState(), { symbol: "BTCUSDT", side: "buy", type: "market", quantity: 1 }, undefined, id(), NOW);
    expect(order.status).toBe("rejected");
  });
});

describe("limit orders", () => {
  it("rests below market and reserves cash", () => {
    const { state, order } = placeOrder(initialState(), { symbol: "BTCUSDT", side: "buy", type: "limit", quantity: 1, limitPrice: 50_000 }, 60_000, id(), NOW);
    expect(order.status).toBe("open");
    expect(state.cash).toBe(STARTING_CASH);
    expect(availableCash(state)).toBe(STARTING_CASH - 50_000);
  });

  it("fills at the limit price once the market reaches it", () => {
    let s = placeOrder(initialState(), { symbol: "BTCUSDT", side: "buy", type: "limit", quantity: 1, limitPrice: 50_000 }, 60_000, id(), NOW).state;
    s = matchLimitOrders(s, { BTCUSDT: 55_000 }, NOW);
    expect(s.orders[0].status).toBe("open");
    s = matchLimitOrders(s, { BTCUSDT: 49_900 }, NOW);
    expect(s.orders[0].status).toBe("filled");
    expect(s.orders[0].filledPrice).toBe(50_000);
    expect(s.cash).toBe(STARTING_CASH - 50_000);
  });

  it("fills a marketable limit immediately", () => {
    const { order } = placeOrder(initialState(), { symbol: "BTCUSDT", side: "buy", type: "limit", quantity: 1, limitPrice: 65_000 }, 60_000, id(), NOW);
    expect(order.status).toBe("filled");
  });

  it("does not allow reserved cash to be spent twice", () => {
    const s = placeOrder(initialState(), { symbol: "BTCUSDT", side: "buy", type: "limit", quantity: 1, limitPrice: 90_000 }, 100_000, id(), NOW).state;
    const { order } = placeOrder(s, { symbol: "ETHUSDT", side: "buy", type: "market", quantity: 10 }, 2_000, id(), NOW);
    expect(order.status).toBe("rejected");
  });

  it("reserves quantity for open sell limits", () => {
    let s = placeOrder(initialState(), { symbol: "ETHUSDT", side: "buy", type: "market", quantity: 2 }, 2_000, id(), NOW).state;
    s = placeOrder(s, { symbol: "ETHUSDT", side: "sell", type: "limit", quantity: 1.5, limitPrice: 3_000 }, 2_000, id(), NOW).state;
    expect(availableQuantity(s, "ETHUSDT")).toBeCloseTo(0.5);
    const { order } = placeOrder(s, { symbol: "ETHUSDT", side: "sell", type: "market", quantity: 1 }, 2_000, id(), NOW);
    expect(order.status).toBe("rejected");
  });

  it("releases the reservation on cancel", () => {
    let s = placeOrder(initialState(), { symbol: "BTCUSDT", side: "buy", type: "limit", quantity: 1, limitPrice: 50_000 }, 60_000, id(), NOW).state;
    s = cancelOrder(s, s.orders[0].id, NOW);
    expect(s.orders[0].status).toBe("cancelled");
    expect(availableCash(s)).toBe(STARTING_CASH);
    expect(matchLimitOrders(s, { BTCUSDT: 1 }, NOW)).toBe(s);
  });
});

describe("portfolio summary", () => {
  it("marks positions to market", () => {
    const s = placeOrder(initialState(), { symbol: "BTCUSDT", side: "buy", type: "market", quantity: 1 }, 50_000, id(), NOW).state;
    const sum = summarize(s, { BTCUSDT: 55_000 });
    expect(sum.holdingsValue).toBe(55_000);
    expect(sum.unrealizedPnl).toBe(5_000);
    expect(sum.equity).toBe(STARTING_CASH + 5_000);
    expect(sum.totalReturnPct).toBeCloseTo(5);
  });
});
