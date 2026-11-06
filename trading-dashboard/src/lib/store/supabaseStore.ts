import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_WATCHLIST, STARTING_CASH } from "../engine";
import type { AccountState, Order, Position } from "../types";
import type { TradingStore } from "./types";

interface OrderRow {
  id: string;
  user_id: string;
  symbol: string;
  side: Order["side"];
  type: Order["type"];
  quantity: number;
  limit_price: number | null;
  status: Order["status"];
  filled_price: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

const toRow = (userId: string, o: Order): OrderRow => ({
  id: o.id,
  user_id: userId,
  symbol: o.symbol,
  side: o.side,
  type: o.type,
  quantity: o.quantity,
  limit_price: o.limitPrice ?? null,
  status: o.status,
  filled_price: o.filledPrice ?? null,
  note: o.note ?? null,
  created_at: o.createdAt,
  updated_at: o.updatedAt,
});

const fromRow = (r: OrderRow): Order => ({
  id: r.id,
  symbol: r.symbol,
  side: r.side,
  type: r.type,
  quantity: Number(r.quantity),
  limitPrice: r.limit_price === null ? undefined : Number(r.limit_price),
  status: r.status,
  filledPrice: r.filled_price === null ? undefined : Number(r.filled_price),
  note: r.note ?? undefined,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/**
 * Cloud mode: account, positions, orders and watchlist are stored in Supabase
 * (Postgres) tables protected by row-level security. See supabase/schema.sql.
 */
export function createSupabaseStore(db: SupabaseClient, userId: string): TradingStore {
  const ensureAccount = async () => {
    check(
      await db
        .from("accounts")
        .upsert({ user_id: userId, cash: STARTING_CASH }, { onConflict: "user_id", ignoreDuplicates: true }),
    );
  };

  const load = async (): Promise<AccountState> => {
    await ensureAccount();
    const [account, positions, orders, watch] = await Promise.all([
      db.from("accounts").select("cash").eq("user_id", userId).single(),
      db.from("positions").select("symbol, quantity, avg_price").eq("user_id", userId),
      db.from("orders").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(500),
      db.from("watchlist").select("symbol, position").eq("user_id", userId).order("position"),
    ]);

    const pos: Record<string, Position> = {};
    for (const p of check(positions) ?? []) {
      pos[p.symbol] = { symbol: p.symbol, quantity: Number(p.quantity), avgPrice: Number(p.avg_price) };
    }
    const watchRows = check(watch) ?? [];
    let watchlist = watchRows.map((w) => w.symbol as string);
    if (watchRows.length === 0) {
      watchlist = [...DEFAULT_WATCHLIST];
      check(await db.from("watchlist").insert(watchlist.map((symbol, position) => ({ user_id: userId, symbol, position }))));
    }

    return {
      cash: Number(check(account)?.cash ?? STARTING_CASH),
      positions: pos,
      orders: (check(orders) as OrderRow[]).map(fromRow),
      watchlist,
    };
  };

  const sync = async (prev: AccountState, next: AccountState) => {
    const ops: PromiseLike<unknown>[] = [];

    if (prev.cash !== next.cash) {
      ops.push(db.from("accounts").update({ cash: next.cash }).eq("user_id", userId).then(check));
    }

    const changedPositions = Object.values(next.positions).filter((p) => prev.positions[p.symbol] !== p);
    if (changedPositions.length) {
      ops.push(
        db
          .from("positions")
          .upsert(changedPositions.map((p) => ({ user_id: userId, symbol: p.symbol, quantity: p.quantity, avg_price: p.avgPrice })))
          .then(check),
      );
    }
    const closed = Object.keys(prev.positions).filter((s) => !next.positions[s]);
    if (closed.length) {
      ops.push(db.from("positions").delete().eq("user_id", userId).in("symbol", closed).then(check));
    }

    const prevOrders = new Map(prev.orders.map((o) => [o.id, o]));
    const changedOrders = next.orders.filter((o) => prevOrders.get(o.id) !== o);
    if (changedOrders.length) {
      ops.push(db.from("orders").upsert(changedOrders.map((o) => toRow(userId, o))).then(check));
    }

    if (prev.watchlist !== next.watchlist) {
      ops.push(
        (async () => {
          check(await db.from("watchlist").delete().eq("user_id", userId));
          if (next.watchlist.length) {
            check(
              await db
                .from("watchlist")
                .insert(next.watchlist.map((symbol, position) => ({ user_id: userId, symbol, position }))),
            );
          }
        })(),
      );
    }

    await Promise.all(ops);
  };

  const reset = async () => {
    check(await db.from("orders").delete().eq("user_id", userId));
    check(await db.from("positions").delete().eq("user_id", userId));
    check(await db.from("accounts").update({ cash: STARTING_CASH }).eq("user_id", userId));
    return load();
  };

  return { mode: "cloud", load, sync, reset };
}
