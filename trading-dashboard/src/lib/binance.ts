/**
 * Binance public market data (no API key required).
 * REST is used for history/snapshots; WebSocket streams for live updates.
 */
import type { BookLevel, Candle, Ticker } from "./types";

export const REST_BASE = process.env.NEXT_PUBLIC_BINANCE_REST || "https://api.binance.com";
export const WS_BASE = process.env.NEXT_PUBLIC_BINANCE_WS || "wss://stream.binance.com:9443";

export const INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
export type Interval = (typeof INTERVALS)[number];

// ---- Raw payload shapes -------------------------------------------------

export interface RawMiniTicker {
  s: string; // symbol
  c: string; // close
  o: string; // open
  h: string;
  l: string;
  q: string; // quote volume
}

export interface RawKlineEvent {
  k: { t: number; o: string; h: string; l: string; c: string; v: string };
}

export interface RawDepth {
  bids: [string, string][];
  asks: [string, string][];
}

export interface RawTrade {
  t: number; // trade id
  p: string;
  q: string;
  T: number; // trade time
  m: boolean; // buyer is maker => aggressive seller
}

// ---- Parsers ------------------------------------------------------------

export function parseMiniTicker(m: RawMiniTicker): Ticker {
  const price = +m.c;
  const open = +m.o;
  return {
    symbol: m.s,
    price,
    open,
    high: +m.h,
    low: +m.l,
    quoteVolume: +m.q,
    changePct: open ? ((price - open) / open) * 100 : 0,
  };
}

export function parseKline(e: RawKlineEvent): Candle {
  const k = e.k;
  return { time: Math.floor(k.t / 1000), open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v };
}

export function parseLevels(levels: [string, string][]): BookLevel[] {
  return levels.map(([p, q]) => ({ price: +p, quantity: +q })).filter((l) => l.quantity > 0);
}

// ---- REST ---------------------------------------------------------------

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${REST_BASE}${path}`, { signal });
  if (!res.ok) throw new Error(`Binance ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export async function fetchCandles(symbol: string, interval: Interval, signal?: AbortSignal): Promise<Candle[]> {
  type Row = [number, string, string, string, string, string];
  const rows = await getJson<Row[]>(`/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=500`, signal);
  return rows.map((r) => ({ time: Math.floor(r[0] / 1000), open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5] }));
}

export async function fetchTickers(symbols: string[], signal?: AbortSignal): Promise<Ticker[]> {
  if (symbols.length === 0) return [];
  type Row = { symbol: string; lastPrice: string; openPrice: string; highPrice: string; lowPrice: string; quoteVolume: string };
  const q = encodeURIComponent(JSON.stringify(symbols));
  const rows = await getJson<Row[]>(`/api/v3/ticker/24hr?symbols=${q}`, signal);
  return rows.map((r) =>
    parseMiniTicker({ s: r.symbol, c: r.lastPrice, o: r.openPrice, h: r.highPrice, l: r.lowPrice, q: r.quoteVolume }),
  );
}

/** Returns true if Binance lists the symbol. */
export async function symbolExists(symbol: string): Promise<boolean> {
  try {
    await getJson(`/api/v3/ticker/price?symbol=${symbol}`);
    return true;
  } catch {
    return false;
  }
}
