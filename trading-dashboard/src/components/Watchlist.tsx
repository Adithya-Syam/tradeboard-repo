"use client";

import { useState } from "react";
import { symbolExists } from "@/lib/binance";
import { baseAsset } from "@/lib/engine";
import { fmtCompact, fmtPct, fmtPrice, tone } from "@/lib/format";
import type { Ticker } from "@/lib/types";
import { useTrading } from "./TradingProvider";

interface Props {
  tickers: Record<string, Ticker>;
  selected: string;
  onSelect: (symbol: string) => void;
}

export function Watchlist({ tickers, selected, onSelect }: Props) {
  const { state, setWatchlist } = useTrading();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    let sym = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!sym) return;
    if (!sym.endsWith("USDT")) sym += "USDT";
    if (state.watchlist.includes(sym)) {
      setError(`${sym} is already in your list.`);
      return;
    }
    setBusy(true);
    const ok = await symbolExists(sym);
    setBusy(false);
    if (!ok) {
      setError(`${sym} isn't listed on Binance.`);
      return;
    }
    setWatchlist([...state.watchlist, sym]);
    setInput("");
    setError(null);
    onSelect(sym);
  };

  const remove = (sym: string) => {
    const next = state.watchlist.filter((s) => s !== sym);
    setWatchlist(next);
    if (sym === selected && next[0]) onSelect(next[0]);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="panel-title">Markets</div>
      <form onSubmit={add} className="flex gap-1 px-3 pb-2">
        <input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
          }}
          placeholder="Add symbol, e.g. LINK"
          className="input flex-1"
          aria-label="Add symbol"
        />
        <button className="rounded bg-line px-2 text-xs hover:bg-[#2b3440]" disabled={busy}>
          {busy ? "…" : "Add"}
        </button>
      </form>
      {error && <p className="px-3 pb-2 text-xs text-down">{error}</p>}
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-3 pb-1 text-[11px] text-muted">
        <span>Pair</span>
        <span className="text-right">Price</span>
        <span className="w-16 text-right">24h</span>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {state.watchlist.map((sym) => {
          const t = tickers[sym];
          return (
            <li key={sym} className="group relative">
              <button
                onClick={() => onSelect(sym)}
                className={`grid w-full grid-cols-[1fr_auto_auto] items-center gap-x-3 px-3 py-1.5 text-left text-sm hover:bg-line/60 ${
                  sym === selected ? "bg-line" : ""
                }`}
              >
                <span>
                  <span className="font-medium">{baseAsset(sym)}</span>
                  <span className="text-muted">/USDT</span>
                  <span className="block text-[11px] text-muted">Vol {t ? fmtCompact(t.quoteVolume) : "—"}</span>
                </span>
                <span className="text-right font-mono tabular-nums">{fmtPrice(t?.price)}</span>
                <span className={`w-16 text-right font-mono text-xs tabular-nums ${t ? tone(t.changePct) : "text-muted"}`}>
                  {t ? fmtPct(t.changePct) : "—"}
                </span>
              </button>
              <button
                onClick={() => remove(sym)}
                className="absolute right-0 top-0 hidden h-full px-1 text-xs text-muted hover:text-down group-hover:block"
                aria-label={`Remove ${sym}`}
                title="Remove"
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
