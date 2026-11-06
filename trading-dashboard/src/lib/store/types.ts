import type { AccountState } from "../types";

/**
 * Where account data lives. The UI talks only to this interface, so the app
 * runs the same way against Supabase or the browser's localStorage.
 */
export interface TradingStore {
  mode: "demo" | "cloud";
  load(): Promise<AccountState>;
  /** Persist the difference between two states. */
  sync(prev: AccountState, next: AccountState): Promise<void>;
  reset(): Promise<AccountState>;
}
