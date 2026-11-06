"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ColorType,
  CrosshairMode,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { INTERVALS, fetchCandles, parseKline, type Interval, type RawKlineEvent } from "@/lib/binance";
import { priceDecimals } from "@/lib/format";
import type { Candle, Order } from "@/lib/types";
import { useBinanceStream } from "@/hooks/useBinanceStream";

const UP = "#0ecb81";
const DOWN = "#f6465d";

interface Props {
  symbol: string;
  openOrders: Order[];
}

/** Candlestick + volume chart with live kline updates and open limit orders drawn as price lines. */
export function PriceChart({ symbol, openOrders }: Props) {
  const [interval, setTimeframe] = useState<Interval>("15m");
  const [error, setError] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const candles = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volume = useRef<ISeriesApi<"Histogram"> | null>(null);
  const loaded = useRef(false);

  // Create the chart once.
  useEffect(() => {
    const el = container.current!;
    const c = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#848e9c", fontSize: 11 },
      grid: { vertLines: { color: "#1c222b" }, horzLines: { color: "#1c222b" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#232a33" },
      timeScale: { borderColor: "#232a33", timeVisible: true, secondsVisible: false },
    });
    candles.current = c.addCandlestickSeries({
      upColor: UP,
      downColor: DOWN,
      borderVisible: false,
      wickUpColor: UP,
      wickDownColor: DOWN,
    });
    volume.current = c.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol" });
    c.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    chart.current = c;
    return () => {
      c.remove();
      chart.current = null;
    };
  }, []);

  // Load history whenever the symbol or interval changes.
  useEffect(() => {
    const ctrl = new AbortController();
    loaded.current = false;
    setError(null);
    candles.current?.setData([]);
    volume.current?.setData([]);
    fetchCandles(symbol, interval, ctrl.signal)
      .then((rows) => {
        const d = priceDecimals(rows.at(-1)?.close ?? 1);
        candles.current?.applyOptions({ priceFormat: { type: "price", precision: d, minMove: 10 ** -d } });
        candles.current?.setData(rows.map(toBar));
        volume.current?.setData(rows.map(toVol));
        chart.current?.timeScale().fitContent();
        loaded.current = true;
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError("Couldn't load price history.");
      });
    return () => ctrl.abort();
  }, [symbol, interval]);

  // Live updates to the current candle.
  const streams = useMemo(() => [`${symbol.toLowerCase()}@kline_${interval}`], [symbol, interval]);
  useBinanceStream(streams, (_s, data) => {
    if (!loaded.current) return;
    const c = parseKline(data as RawKlineEvent);
    candles.current?.update(toBar(c));
    volume.current?.update(toVol(c));
  });

  // Draw a dashed line for each open limit order on this symbol.
  const orderKey = openOrders.map((o) => `${o.id}:${o.limitPrice}`).join(",");
  useEffect(() => {
    const series = candles.current;
    if (!series) return;
    const lines: IPriceLine[] = openOrders
      .filter((o) => o.limitPrice !== undefined)
      .map((o) =>
        series.createPriceLine({
          price: o.limitPrice!,
          color: o.side === "buy" ? UP : DOWN,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: `${o.side.toUpperCase()} ${o.quantity}`,
        }),
      );
    return () => lines.forEach((l) => series.removePriceLine(l));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-line px-3 py-2 text-xs">
        {INTERVALS.map((iv) => (
          <button
            key={iv}
            onClick={() => setTimeframe(iv)}
            className={`rounded px-2 py-1 ${iv === interval ? "bg-line text-white" : "text-muted hover:text-white"}`}
          >
            {iv}
          </button>
        ))}
        {error && <span className="ml-auto text-down">{error}</span>}
      </div>
      <div ref={container} className="min-h-0 flex-1" />
    </div>
  );
}

const toBar = (c: Candle) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close });
const toVol = (c: Candle) => ({
  time: c.time as UTCTimestamp,
  value: c.volume,
  color: c.close >= c.open ? "rgba(14,203,129,0.35)" : "rgba(246,70,93,0.35)",
});
