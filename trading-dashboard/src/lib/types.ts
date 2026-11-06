export type Side = "buy" | "sell";
export type OrderType = "market" | "limit";
export type OrderStatus = "open" | "filled" | "cancelled" | "rejected";

export interface Order {
  id: string;
  symbol: string;
  side: Side;
  type: OrderType;
  quantity: number;
  /** Required for limit orders. */
  limitPrice?: number;
  status: OrderStatus;
  filledPrice?: number;
  /** Reason shown to the user when status is "rejected". */
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Position {
  symbol: string;
  quantity: number;
  avgPrice: number;
}

export interface AccountState {
  cash: number;
  positions: Record<string, Position>;
  orders: Order[];
  watchlist: string[];
}

export interface Ticker {
  symbol: string;
  price: number;
  open: number;
  high: number;
  low: number;
  /** 24h quote volume (USDT). */
  quoteVolume: number;
  changePct: number;
}

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BookLevel {
  price: number;
  quantity: number;
}

export interface OrderBook {
  bids: BookLevel[];
  asks: BookLevel[];
}

export type FeedStatus = "connecting" | "live" | "reconnecting" | "offline";
