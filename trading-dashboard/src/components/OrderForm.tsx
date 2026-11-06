"use client";

import { useEffect, useState } from "react";
import { availableCash, availableQuantity, baseAsset, validateOrder, type OrderRequest } from "@/lib/engine";
import { fmtPrice, fmtQty, fmtUsd, priceDecimals } from "@/lib/format";
import type { OrderType, Side } from "@/lib/types";
import { useTrading } from "./TradingProvider";

interface Props {
  symbol: string;
  price?: number;
  /** Set when the user clicks a price in the order book. */
  pickedPrice?: { value: number; at: number };
}

const PCTS = [25, 50, 75, 100];

export function OrderForm({ symbol, price, pickedPrice }: Props) {
  const { state, submitOrder, ready } = useTrading();
  const [side, setSide] = useState<Side>("buy");
  const [type, setType] = useState<OrderType>("market");
  const [qty, setQty] = useState("");
  const [limit, setLimit] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const base = baseAsset(symbol);

  useEffect(() => {
    setQty("");
    setLimit("");
    setFeedback(null);
  }, [symbol]);

  useEffect(() => {
    if (!pickedPrice) return;
    setType("limit");
    setLimit(String(pickedPrice.value));
  }, [pickedPrice]);

  const execPrice = type === "market" ? price : parseFloat(limit);
  const quantity = parseFloat(qty);
  const total = Number.isFinite(quantity) && execPrice ? quantity * execPrice : 0;
  const cashAvail = availableCash(state);
  const qtyAvail = availableQuantity(state, symbol);

  const req: OrderRequest = {
    symbol,
    side,
    type,
    quantity,
    limitPrice: type === "limit" ? parseFloat(limit) : undefined,
  };
  const check = qty ? validateOrder(state, req, price) : null;

  const setPct = (pct: number) => {
    if (side === "buy") {
      if (!execPrice) return;
      setQty(trim((cashAvail * pct) / 100 / execPrice));
    } else {
      setQty(trim((qtyAvail * pct) / 100));
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const order = submitOrder(req, price);
    if (order.status === "rejected") {
      setFeedback({ ok: false, text: order.note ?? "Order rejected." });
      return;
    }
    const what = `${side === "buy" ? "Bought" : "Sold"} ${fmtQty(quantity)} ${base}`;
    setFeedback({
      ok: true,
      text:
        order.status === "filled"
          ? `${what} at ${fmtPrice(order.filledPrice)}`
          : `Limit ${side} for ${fmtQty(quantity)} ${base} at ${fmtPrice(order.limitPrice)} placed`,
    });
    setQty("");
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 p-3 text-sm">
      <div className="grid grid-cols-2 rounded bg-bg p-0.5">
        {(["buy", "sell"] as const).map((s) => (
          <button
            type="button"
            key={s}
            onClick={() => setSide(s)}
            className={`rounded py-1.5 font-medium capitalize ${
              side === s ? (s === "buy" ? "bg-up text-black" : "bg-down text-white") : "text-muted"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="flex gap-4 text-xs">
        {(["market", "limit"] as const).map((t) => (
          <button
            type="button"
            key={t}
            onClick={() => setType(t)}
            className={`capitalize ${type === t ? "text-accent" : "text-muted hover:text-white"}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex justify-between text-xs text-muted">
        <span>Available</span>
        <span className="font-mono text-white">
          {side === "buy" ? `${fmtUsd(cashAvail)} USDT` : `${fmtQty(qtyAvail)} ${base}`}
        </span>
      </div>

      {type === "limit" ? (
        <Field label="Price" unit="USDT">
          <input
            inputMode="decimal"
            value={limit}
            onChange={(e) => setLimit(clean(e.target.value))}
            placeholder={price ? price.toFixed(priceDecimals(price)) : "0.00"}
            className="input w-full pr-14 text-right font-mono"
            aria-label="Limit price"
          />
        </Field>
      ) : (
        <Field label="Price" unit="USDT">
          <div className="input w-full pr-14 text-right font-mono text-muted">Market · {fmtPrice(price)}</div>
        </Field>
      )}

      <Field label="Amount" unit={base}>
        <input
          inputMode="decimal"
          value={qty}
          onChange={(e) => setQty(clean(e.target.value))}
          placeholder="0.00"
          className="input w-full pr-14 text-right font-mono"
          aria-label="Amount"
        />
      </Field>

      <div className="grid grid-cols-4 gap-1">
        {PCTS.map((p) => (
          <button
            type="button"
            key={p}
            onClick={() => setPct(p)}
            className="rounded border border-line py-1 text-xs text-muted hover:border-muted hover:text-white"
          >
            {p}%
          </button>
        ))}
      </div>

      <div className="flex justify-between text-xs text-muted">
        <span>Total</span>
        <span className="font-mono text-white">{fmtUsd(total)} USDT</span>
      </div>

      {check && !check.ok && <p className="text-xs text-down">{check.error}</p>}

      <button
        disabled={!ready || !check?.ok}
        className={`rounded py-2.5 font-semibold disabled:opacity-40 ${
          side === "buy" ? "bg-up text-black" : "bg-down text-white"
        }`}
      >
        {side === "buy" ? "Buy" : "Sell"} {base}
      </button>

      {feedback && (
        <p role="status" className={`text-xs ${feedback.ok ? "text-up" : "text-down"}`}>
          {feedback.text}
        </p>
      )}
    </form>
  );
}

function Field({ label, unit, children }: { label: string; unit: string; children: React.ReactNode }) {
  return (
    <label className="relative block">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted">{label}</span>
      {children}
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">{unit}</span>
    </label>
  );
}

/** Keep only digits and a single decimal point. */
function clean(v: string): string {
  const s = v.replace(/,/g, ".").replace(/[^0-9.]/g, "");
  const i = s.indexOf(".");
  return i === -1 ? s : s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, "");
}

/** Round down to 6 decimals so 100% never exceeds the balance. */
function trim(n: number): string {
  return (Math.floor(n * 1e6) / 1e6).toString();
}
