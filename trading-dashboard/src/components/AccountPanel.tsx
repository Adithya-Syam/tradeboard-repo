"use client";

import { useState } from "react";
import { baseAsset } from "@/lib/engine";
import { fmtPct, fmtPrice, fmtQty, fmtTime, fmtUsd, tone } from "@/lib/format";
import type { Order, Ticker } from "@/lib/types";
import { useTrading } from "./TradingProvider";

type Tab = "positions" | "open" | "history";

interface Props {
  tickers: Record<string, Ticker>;
  onSelect: (symbol: string) => void;
}

export function AccountPanel({ tickers, onSelect }: Props) {
  const { state, cancel } = useTrading();
  const [tab, setTab] = useState<Tab>("positions");
  const positions = Object.values(state.positions);
  const open = state.orders.filter((o) => o.status === "open");
  const history = state.orders.filter((o) => o.status !== "open");

  const tabs: [Tab, string, number][] = [
    ["positions", "Positions", positions.length],
    ["open", "Open orders", open.length],
    ["history", "Order history", history.length],
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex border-b border-line text-xs">
        {tabs.map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-2 ${tab === key ? "border-b-2 border-accent text-white" : "text-muted hover:text-white"}`}
          >
            {label} <span className="text-muted">({count})</span>
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "positions" && (
          <Table
            head={["Asset", "Amount", "Avg. entry", "Mark price", "Value", "Unrealized P&L"]}
            empty="No positions yet. Place a buy order to open one."
            rows={positions.map((p) => {
              const mark = tickers[p.symbol]?.price ?? p.avgPrice;
              const pnl = (mark - p.avgPrice) * p.quantity;
              const pnlPct = ((mark - p.avgPrice) / p.avgPrice) * 100;
              return [
                <SymbolCell key="s" symbol={p.symbol} onSelect={onSelect} />,
                fmtQty(p.quantity),
                fmtPrice(p.avgPrice),
                fmtPrice(mark),
                fmtUsd(p.quantity * mark),
                <span key="p" className={tone(pnl)}>
                  {fmtUsd(pnl, true)} ({fmtPct(pnlPct)})
                </span>,
              ];
            })}
          />
        )}
        {tab === "open" && (
          <Table
            head={["Time", "Pair", "Side", "Type", "Price", "Amount", "Total", ""]}
            empty="No open orders."
            rows={open.map((o) => [
              fmtTime(o.createdAt),
              <SymbolCell key="s" symbol={o.symbol} onSelect={onSelect} />,
              <SideCell key="d" order={o} />,
              "Limit",
              fmtPrice(o.limitPrice),
              fmtQty(o.quantity),
              fmtUsd(o.quantity * (o.limitPrice ?? 0)),
              <button key="c" onClick={() => cancel(o.id)} className="text-accent hover:underline">
                Cancel
              </button>,
            ])}
          />
        )}
        {tab === "history" && (
          <Table
            head={["Time", "Pair", "Side", "Type", "Fill price", "Amount", "Total", "Status"]}
            empty="No orders yet."
            rows={history.map((o) => [
              fmtTime(o.updatedAt),
              <SymbolCell key="s" symbol={o.symbol} onSelect={onSelect} />,
              <SideCell key="d" order={o} />,
              o.type === "market" ? "Market" : `Limit @ ${fmtPrice(o.limitPrice)}`,
              fmtPrice(o.filledPrice),
              fmtQty(o.quantity),
              o.filledPrice ? fmtUsd(o.quantity * o.filledPrice) : "—",
              <StatusCell key="st" order={o} />,
            ])}
          />
        )}
      </div>
    </div>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (rows.length === 0) return <p className="p-6 text-center text-sm text-muted">{empty}</p>;
  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-panel text-muted">
        <tr>
          {head.map((h, i) => (
            <th key={i} className={`px-3 py-2 font-normal ${i === 0 ? "text-left" : "text-right"}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="font-mono tabular-nums">
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-line/60 hover:bg-line/30">
            {r.map((c, j) => (
              <td key={j} className={`whitespace-nowrap px-3 py-1.5 ${j === 0 ? "text-left" : "text-right"}`}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SymbolCell({ symbol, onSelect }: { symbol: string; onSelect: (s: string) => void }) {
  return (
    <button onClick={() => onSelect(symbol)} className="font-sans hover:text-accent">
      {baseAsset(symbol)}
      <span className="text-muted">/USDT</span>
    </button>
  );
}

function SideCell({ order }: { order: Order }) {
  return <span className={order.side === "buy" ? "text-up" : "text-down"}>{order.side === "buy" ? "Buy" : "Sell"}</span>;
}

function StatusCell({ order }: { order: Order }) {
  const color = { filled: "text-up", cancelled: "text-muted", rejected: "text-down", open: "text-accent" }[order.status];
  return (
    <span className={`font-sans capitalize ${color}`} title={order.note}>
      {order.status}
    </span>
  );
}
