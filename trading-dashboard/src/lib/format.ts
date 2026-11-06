/** Decimal places that suit a price of this size (BTC: 2, XRP: 4, SHIB: 8). */
export function priceDecimals(price: number): number {
  if (price >= 100) return 2;
  if (price >= 1) return 4;
  if (price >= 0.01) return 6;
  return 8;
}

export function fmtPrice(price: number | undefined, ref?: number): string {
  if (price === undefined || !Number.isFinite(price)) return "—";
  const d = priceDecimals(ref ?? price);
  return price.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function fmtQty(q: number): string {
  return q.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export function fmtUsd(n: number, signed = false): string {
  const s = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!signed) return `${n < 0 ? "-" : ""}$${s}`;
  return `${n >= 0 ? "+" : "-"}$${s}`;
}

export function fmtPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

export function fmtCompact(n: number): string {
  return n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 2 });
}

export function fmtTime(iso: string | number): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export const tone = (n: number) => (n > 0 ? "text-up" : n < 0 ? "text-down" : "text-muted");
