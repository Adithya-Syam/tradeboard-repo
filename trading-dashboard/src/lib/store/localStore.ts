import { initialState } from "../engine";
import type { AccountState } from "../types";
import type { TradingStore } from "./types";

const KEY = "tradeboard:v1";

/** Demo mode: everything is kept in this browser's localStorage. */
export function createLocalStore(): TradingStore {
  const read = (): AccountState => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return { ...initialState(), ...(JSON.parse(raw) as AccountState) };
    } catch {
      /* storage unavailable or corrupt: start fresh */
    }
    return initialState();
  };
  const write = (s: AccountState) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* ignore quota / privacy-mode errors */
    }
  };

  return {
    mode: "demo",
    load: async () => read(),
    sync: async (_prev, next) => write(next),
    reset: async () => {
      const s = initialState();
      write(s);
      return s;
    },
  };
}
