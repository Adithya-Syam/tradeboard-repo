"use client";

import { useEffect, useRef, useState } from "react";
import { WS_BASE } from "@/lib/binance";
import type { FeedStatus } from "@/lib/types";

/**
 * Subscribes to one or more Binance combined streams and reconnects with
 * exponential backoff (1s, 2s, 4s … capped at 30s) if the socket drops.
 *
 * `onMessage` can change on every render; the latest one is always used
 * without reopening the socket.
 */
export function useBinanceStream(
  streams: string[],
  onMessage: (stream: string, data: unknown) => void,
): FeedStatus {
  const [status, setStatus] = useState<FeedStatus>("connecting");
  const handler = useRef(onMessage);
  handler.current = onMessage;

  const key = streams.join("/");

  useEffect(() => {
    if (!key) {
      setStatus("offline");
      return;
    }
    let ws: WebSocket | null = null;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let closedByUs = false;

    const connect = () => {
      setStatus(retry === 0 ? "connecting" : "reconnecting");
      ws = new WebSocket(`${WS_BASE}/stream?streams=${key}`);
      ws.onopen = () => {
        retry = 0;
        setStatus("live");
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as { stream: string; data: unknown };
          handler.current(msg.stream, msg.data);
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        if (closedByUs) return;
        const delay = Math.min(30_000, 1000 * 2 ** retry++);
        setStatus("reconnecting");
        timer = setTimeout(connect, delay);
      };
      ws.onerror = () => ws?.close();
    };

    connect();
    return () => {
      closedByUs = true;
      clearTimeout(timer);
      ws?.close();
    };
  }, [key]);

  return status;
}

/**
 * Buffers fast-moving values in a ref and pushes them to React state at most
 * every `ms` milliseconds, so 10 updates/sec from a feed don't mean 10 renders/sec.
 */
export function useThrottledState<T>(initial: T, ms: number): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initial);
  const latest = useRef<T>(initial);
  const pending = useRef(false);

  const set = useRef((v: T) => {
    latest.current = v;
    if (pending.current) return;
    pending.current = true;
    setTimeout(() => {
      pending.current = false;
      setValue(latest.current);
    }, ms);
  }).current;

  return [value, set];
}
