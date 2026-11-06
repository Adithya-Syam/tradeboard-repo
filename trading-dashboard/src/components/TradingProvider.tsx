"use client";

import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { cancelOrder, initialState, matchLimitOrders, placeOrder, type OrderRequest } from "@/lib/engine";
import type { TradingStore } from "@/lib/store/types";
import type { AccountState, Order } from "@/lib/types";

type Action =
  | { type: "hydrate"; state: AccountState }
  | { type: "place"; req: OrderRequest; price: number | undefined; id: string; now: string }
  | { type: "cancel"; id: string; now: string }
  | { type: "tick"; prices: Record<string, number>; now: string }
  | { type: "watchlist"; symbols: string[] };

function reducer(state: AccountState, action: Action): AccountState {
  switch (action.type) {
    case "hydrate":
      return action.state;
    case "place":
      return placeOrder(state, action.req, action.price, action.id, action.now).state;
    case "cancel":
      return cancelOrder(state, action.id, action.now);
    case "tick":
      return matchLimitOrders(state, action.prices, action.now);
    case "watchlist":
      return { ...state, watchlist: action.symbols };
  }
}

interface TradingContextValue {
  state: AccountState;
  ready: boolean;
  mode: TradingStore["mode"];
  syncError: string | null;
  submitOrder: (req: OrderRequest, price: number | undefined) => Order;
  cancel: (id: string) => void;
  setWatchlist: (symbols: string[]) => void;
  onPrices: (prices: Record<string, number>) => void;
  reset: () => Promise<void>;
}

const TradingContext = createContext<TradingContextValue | null>(null);

export function useTrading(): TradingContextValue {
  const ctx = useContext(TradingContext);
  if (!ctx) throw new Error("useTrading must be used inside <TradingProvider>");
  return ctx;
}

export function TradingProvider({
  store,
  children,
}: {
  store: TradingStore;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [ready, setReady] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const persisted = useRef<AccountState | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Load saved account.
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    store
      .load()
      .then((s) => {
        if (cancelled) return;
        persisted.current = s;
        dispatch({ type: "hydrate", state: s });
        setReady(true);
      })
      .catch((e: Error) => !cancelled && setSyncError(`Could not load account: ${e.message}`));
    return () => {
      cancelled = true;
    };
  }, [store]);

  // Persist every change after hydration.
  useEffect(() => {
    const prev = persisted.current;
    if (!ready || !prev || prev === state) return;
    persisted.current = state;
    store.sync(prev, state).then(
      () => setSyncError(null),
      (e: Error) => setSyncError(`Save failed: ${e.message}`),
    );
  }, [state, ready, store]);

  /** Called with each batch of live prices; fills any limit orders that were hit. */
  const onPrices = useCallback((prices: Record<string, number>) => {
    dispatch({ type: "tick", prices, now: new Date().toISOString() });
  }, []);

  const submitOrder = useCallback((req: OrderRequest, price: number | undefined) => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    // Run the engine once here so the caller gets the result synchronously for feedback.
    const { order } = placeOrder(stateRef.current, req, price, id, now);
    dispatch({ type: "place", req, price, id, now });
    return order;
  }, []);

  const cancel = useCallback((id: string) => dispatch({ type: "cancel", id, now: new Date().toISOString() }), []);
  const setWatchlist = useCallback((symbols: string[]) => dispatch({ type: "watchlist", symbols }), []);
  const reset = useCallback(async () => {
    const s = await store.reset();
    persisted.current = s;
    dispatch({ type: "hydrate", state: s });
  }, [store]);

  return (
    <TradingContext.Provider value={{ state, ready, mode: store.mode, syncError, submitOrder, cancel, setWatchlist, onPrices, reset }}>
      {children}
    </TradingContext.Provider>
  );
}
