"use client";

import { useState } from "react";
import { fmtPrice, fmtQty } from "@/lib/format";
import type { BookLevel } from "@/lib/types";
import { useOrderBook, useRecentTrades } from "@/hooks/useMarketData";

interface Props {
  symbol: string;
  lastPrice?: number;
  onPickPrice: (price: number) => void;
}

/** Live order book and trade tape. Clicking a price fills it into the order form. */
export function OrderBookPanel({ symbol, lastPrice, onPickPrice }: Props) {
  const [tab, setTab] = useState<"book" | "trades">("book");
  return (
    <div className="flex h-full flex-col">
      <div className="flex border-b border-line text-xs">
        {(["book", "trades"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 ${tab === t ? "border-b-2 border-accent text-white" : "text-muted hover:text-white"}`}
          >
            {t === "book" ? "Order book" : "Trades"}
          </button>
        ))}
      </div>
      {tab === "book" ? (
        <Book symbol={symbol} lastPrice={lastPrice} onPickPrice={onPickPrice} />
      ) : (
        <Trades symbol={symbol} onPickPrice={onPickPrice} />
      )}
    </div>
  );
}

function Book({ symbol, lastPrice, onPickPrice }: Props) {
  const { bids, asks } = useOrderBook(symbol);
  const rows = 9;
  const topAsks = asks.slice(0, rows).reverse();
  const topBids = bids.slice(0, rows);
  const max = Math.max(1e-12, ...topAsks.map((l) => l.quantity), ...topBids.map((l) => l.quantity));
  const ref = lastPrice ?? bids[0]?.price;
  const spread = asks[0] && bids[0] ? asks[0].price - bids[0].price : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col px-2 py-1 font-mono text-xs tabular-nums">
      <Header />
      <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden">
        {topAsks.map((l) => (
          <Row key={`a${l.price}`} level={l} max={max} side="ask" refPrice={ref} onPick={onPickPrice} />
        ))}
      </div>
      <div className="my-1 flex items-baseline justify-between border-y border-line px-1 py-1.5">
        <span className="text-base text-white">{fmtPrice(lastPrice)}</span>
        <span className="text-muted">Spread {spread !== undefined ? fmtPrice(spread, ref) : "—"}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {topBids.map((l) => (
          <Row key={`b${l.price}`} level={l} max={max} side="bid" refPrice={ref} onPick={onPickPrice} />
        ))}
      </div>
      {bids.length === 0 && <p className="py-6 text-center text-muted">Waiting for order book…</p>}
    </div>
  );
}

function Header() {
  return (
    <div className="grid grid-cols-3 px-1 pb-1 text-[11px] text-muted">
      <span>Price</span>
      <span className="text-right">Amount</span>
      <span className="text-right">Total</span>
    </div>
  );
}

function Row({
  level,
  max,
  side,
  refPrice,
  onPick,
}: {
  level: BookLevel;
  max: number;
  side: "bid" | "ask";
  refPrice?: number;
  onPick: (p: number) => void;
}) {
  const pct = (level.quantity / max) * 100;
  return (
    <button
      onClick={() => onPick(level.price)}
      className="relative grid w-full grid-cols-3 px-1 py-[1px] text-left hover:bg-line/60"
    >
      <span
        className={`absolute inset-y-0 right-0 ${side === "bid" ? "bg-up/10" : "bg-down/10"}`}
        style={{ width: `${pct}%` }}
      />
      <span className={`relative ${side === "bid" ? "text-up" : "text-down"}`}>{fmtPrice(level.price, refPrice)}</span>
      <span className="relative text-right">{fmtQty(level.quantity)}</span>
      <span className="relative text-right text-muted">{(level.price * level.quantity).toFixed(2)}</span>
    </button>
  );
}

function Trades({ symbol, onPickPrice }: { symbol: string; onPickPrice: (p: number) => void }) {
  const trades = useRecentTrades(symbol);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1 font-mono text-xs tabular-nums">
      <div className="grid grid-cols-3 px-1 pb-1 text-[11px] text-muted">
        <span>Price</span>
        <span className="text-right">Amount</span>
        <span className="text-right">Time</span>
      </div>
      {trades.map((t) => (
        <button
          key={t.id}
          onClick={() => onPickPrice(t.price)}
          className="grid w-full grid-cols-3 px-1 py-[1px] text-left hover:bg-line/60"
        >
          <span className={t.side === "buy" ? "text-up" : "text-down"}>{fmtPrice(t.price)}</span>
          <span className="text-right">{fmtQty(t.quantity)}</span>
          <span className="text-right text-muted">{new Date(t.time).toLocaleTimeString("en-GB")}</span>
        </button>
      ))}
      {trades.length === 0 && <p className="py-6 text-center text-muted">Waiting for trades…</p>}
    </div>
  );
}
