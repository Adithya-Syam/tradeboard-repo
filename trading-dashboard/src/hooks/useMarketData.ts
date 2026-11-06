"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchTickers,
  parseLevels,
  parseMiniTicker,
  type RawDepth,
  type RawMiniTicker,
  type RawTrade,
} from "@/lib/binance";
import type { FeedStatus, OrderBook, Ticker } from "@/lib/types";
import { useBinanceStream, useThrottledState } from "./useBinanceStream";

/** Live 24h tickers for every symbol in the watchlist. */
export function useTickers(symbols: string[]): { tickers: Record<string, Ticker>; status: FeedStatus } {
  const [tickers, setTickers] = useState<Record<string, Ticker>>({});
  const buffer = useRef<Record<string, Ticker>>({});
  const dirty = useRef(false);
  const key = symbols.join(",");

  // REST snapshot so prices show before the first stream message arrives.
  useEffect(() => {
    const ctrl = new AbortController();
    fetchTickers(key ? key.split(",") : [], ctrl.signal)
      .then((list) => {
        for (const t of list) buffer.current[t.symbol] = buffer.current[t.symbol] ?? t;
        setTickers({ ...buffer.current });
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [key]);

  // Flush buffered ticks at most twice a second.
  useEffect(() => {
    const id = setInterval(() => {
      if (!dirty.current) return;
      dirty.current = false;
      setTickers({ ...buffer.current });
    }, 500);
    return () => clearInterval(id);
  }, []);

  const streams = useMemo(() => (key ? key.split(",").map((s) => `${s.toLowerCase()}@miniTicker`) : []), [key]);
  const status = useBinanceStream(streams, (_stream, data) => {
    const t = parseMiniTicker(data as RawMiniTicker);
    buffer.current[t.symbol] = t;
    dirty.current = true;
  });

  return { tickers, status };
}

/** Top 20 levels of the order book, refreshed every 100ms by Binance and rendered ~4x/sec. */
export function useOrderBook(symbol: string): OrderBook {
  const [book, setBook] = useThrottledState<OrderBook>({ bids: [], asks: [] }, 250);
  const streams = useMemo(() => [`${symbol.toLowerCase()}@depth20@100ms`], [symbol]);
  useEffect(() => setBook({ bids: [], asks: [] }), [symbol, setBook]);
  useBinanceStream(streams, (_s, data) => {
    const d = data as RawDepth;
    setBook({ bids: parseLevels(d.bids), asks: parseLevels(d.asks) });
  });
  return book;
}

export interface Trade {
  id: number;
  price: number;
  quantity: number;
  time: number;
  side: "buy" | "sell";
}

/** Most recent public trades for a symbol. */
export function useRecentTrades(symbol: string, max = 30): Trade[] {
  const [trades, setTrades] = useThrottledState<Trade[]>([], 300);
  const list = useRef<Trade[]>([]);
  const streams = useMemo(() => [`${symbol.toLowerCase()}@trade`], [symbol]);
  useEffect(() => {
    list.current = [];
    setTrades([]);
  }, [symbol, setTrades]);
  useBinanceStream(streams, (_s, data) => {
    const t = data as RawTrade;
    const trade: Trade = { id: t.t, price: +t.p, quantity: +t.q, time: t.T, side: t.m ? "sell" : "buy" };
    list.current = [trade, ...list.current].slice(0, max);
    setTrades(list.current);
  });
  return trades;
}
