"use client";

import { useEffect, useMemo, useState } from "react";
import { baseAsset, summarize } from "@/lib/engine";
import { fmtCompact, fmtPct, fmtPrice, fmtUsd, tone } from "@/lib/format";
import type { FeedStatus } from "@/lib/types";
import { useTickers } from "@/hooks/useMarketData";
import { AccountPanel } from "./AccountPanel";
import { OrderBookPanel } from "./OrderBookPanel";
import { OrderForm } from "./OrderForm";
import { PriceChart } from "./PriceChart";
import { useTrading } from "./TradingProvider";
import { Watchlist } from "./Watchlist";

interface Props {
  userEmail?: string;
  onSignOut?: () => void;
}

export function Dashboard({ userEmail, onSignOut }: Props) {
  const { state, mode, syncError, onPrices, reset } = useTrading();
  const [selected, setSelected] = useState(state.watchlist[0] ?? "BTCUSDT");
  const [picked, setPicked] = useState<{ value: number; at: number }>();

  // Stream prices for the watchlist plus anything held or with open orders.
  const symbols = useMemo(() => {
    const set = new Set([
      ...state.watchlist,
      ...Object.keys(state.positions),
      ...state.orders.filter((o) => o.status === "open").map((o) => o.symbol),
      selected,
    ]);
    return [...set].sort();
  }, [state.watchlist, state.positions, state.orders, selected]);

  const { tickers, status } = useTickers(symbols);
  const prices = useMemo(
    () => Object.fromEntries(Object.values(tickers).map((t) => [t.symbol, t.price])) as Record<string, number>,
    [tickers],
  );
  useEffect(() => onPrices(prices), [prices, onPrices]);

  const summary = summarize(state, prices);
  const t = tickers[selected];
  const openOrders = state.orders.filter((o) => o.status === "open" && o.symbol === selected);

  useEffect(() => {
    document.title = t ? `${fmtPrice(t.price)} · ${baseAsset(selected)}/USDT · Tradeboard` : "Tradeboard";
  }, [t, selected]);

  const confirmReset = async () => {
    if (window.confirm("Reset your paper account to $100,000 and clear all orders?")) await reset();
  };

  return (
    <div className="flex h-screen min-h-[640px] flex-col">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line bg-panel px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Logo />
          <span className="font-semibold tracking-tight">Tradeboard</span>
          <span className="rounded bg-line px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">Paper</span>
        </div>
        <Stat label="Equity" value={fmtUsd(summary.equity)} />
        <Stat label="Cash" value={fmtUsd(summary.cash)} />
        <Stat label="Unrealized P&L" value={fmtUsd(summary.unrealizedPnl, true)} className={tone(summary.unrealizedPnl)} />
        <Stat label="Total return" value={fmtPct(summary.totalReturnPct)} className={tone(summary.totalReturnPct)} />
        <div className="ml-auto flex items-center gap-3 text-xs text-muted">
          <FeedBadge status={status} />
          <span title={mode === "demo" ? "Data is saved in this browser" : "Data is saved to Supabase"}>
            {mode === "demo" ? "Demo mode" : userEmail}
          </span>
          <button onClick={confirmReset} className="hover:text-white">
            Reset
          </button>
          {onSignOut && (
            <button onClick={onSignOut} className="hover:text-white">
              Sign out
            </button>
          )}
        </div>
      </header>

      {syncError && <div className="bg-down/15 px-4 py-1.5 text-xs text-down">{syncError}</div>}

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-px bg-line lg:grid-cols-[260px_1fr_300px] lg:grid-rows-[1fr_260px]">
        <section className="bg-panel lg:row-span-2">
          <Watchlist tickers={tickers} selected={selected} onSelect={setSelected} />
        </section>

        <section className="flex min-h-[420px] flex-col bg-panel">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b border-line px-4 py-2">
            <h1 className="text-lg font-semibold">
              {baseAsset(selected)}
              <span className="text-muted">/USDT</span>
            </h1>
            <span className={`font-mono text-lg tabular-nums ${t ? tone(t.changePct) : ""}`}>{fmtPrice(t?.price)}</span>
            <Stat label="24h change" value={t ? fmtPct(t.changePct) : "—"} className={t ? tone(t.changePct) : ""} />
            <Stat label="24h high" value={fmtPrice(t?.high)} />
            <Stat label="24h low" value={fmtPrice(t?.low)} />
            <Stat label="24h volume" value={t ? `${fmtCompact(t.quoteVolume)} USDT` : "—"} />
          </div>
          <div className="min-h-0 flex-1">
            <PriceChart symbol={selected} openOrders={openOrders} />
          </div>
        </section>

        <section className="min-h-[480px] bg-panel lg:row-span-2">
          <div className="flex h-full flex-col">
            <div className="min-h-0 flex-1 overflow-hidden">
              <OrderBookPanel
                symbol={selected}
                lastPrice={t?.price}
                onPickPrice={(value) => setPicked({ value, at: Date.now() })}
              />
            </div>
            <div className="border-t border-line">
              <OrderForm symbol={selected} price={t?.price} pickedPrice={picked} />
            </div>
          </div>
        </section>

        <section className="min-h-[240px] bg-panel">
          <AccountPanel tickers={tickers} onSelect={setSelected} />
        </section>
      </main>
    </div>
  );
}

function Stat({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className="leading-tight">
      <div className="text-[11px] text-muted">{label}</div>
      <div className={`font-mono text-sm tabular-nums ${className}`}>{value}</div>
    </div>
  );
}

function FeedBadge({ status }: { status: FeedStatus }) {
  const map: Record<FeedStatus, [string, string]> = {
    live: ["bg-up", "Live"],
    connecting: ["bg-accent", "Connecting"],
    reconnecting: ["bg-accent", "Reconnecting"],
    offline: ["bg-down", "Offline"],
  };
  const [dot, label] = map[status];
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${dot} ${status === "live" ? "animate-pulse" : ""}`} />
      {label}
    </span>
  );
}

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <rect width="24" height="24" rx="6" fill="#f0b90b" />
      <path d="M5 16l4-5 3 3 6-7" stroke="#0b0e11" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
