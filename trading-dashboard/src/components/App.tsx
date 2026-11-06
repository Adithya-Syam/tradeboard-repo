"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createLocalStore } from "@/lib/store/localStore";
import { createSupabaseStore } from "@/lib/store/supabaseStore";
import { getSupabase } from "@/lib/supabase";
import { Dashboard } from "./Dashboard";
import { TradingProvider } from "./TradingProvider";

/**
 * Picks the storage mode:
 * - Supabase env vars set → sign-in required, data stored in Postgres.
 * - Otherwise → demo mode, data stored in localStorage.
 */
export function App() {
  const supabase = getSupabase();
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  const userId = session?.user.id;
  const store = useMemo(() => {
    if (!supabase) return createLocalStore();
    return userId ? createSupabaseStore(supabase, userId) : null;
  }, [supabase, userId]);

  if (checking) return <Splash text="Loading…" />;
  if (supabase && !session) return <SignIn />;
  if (!store) return <Splash text="Loading…" />;

  return (
    <TradingProvider key={userId ?? "demo"} store={store}>
      <Dashboard
        userEmail={session?.user.email}
        onSignOut={supabase ? () => void supabase.auth.signOut() : undefined}
      />
    </TradingProvider>
  );
}

function Splash({ text }: { text: string }) {
  return <div className="grid h-screen place-items-center text-sm text-muted">{text}</div>;
}

function SignIn() {
  const supabase = getSupabase()!;
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { data, error } =
      mode === "in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) setMsg({ ok: false, text: error.message });
    else if (mode === "up" && !data.session) setMsg({ ok: true, text: "Check your email to confirm your account, then sign in." });
  };

  return (
    <div className="grid h-screen place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-lg border border-line bg-panel p-6">
        <div>
          <h1 className="text-xl font-semibold">Tradeboard</h1>
          <p className="mt-1 text-sm text-muted">
            Paper-trade crypto with live market data. Every account starts with $100,000.
          </p>
        </div>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="input w-full"
          autoComplete="email"
        />
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (min. 6 characters)"
          className="input w-full"
          autoComplete={mode === "in" ? "current-password" : "new-password"}
        />
        {msg && <p className={`text-xs ${msg.ok ? "text-up" : "text-down"}`}>{msg.text}</p>}
        <button disabled={busy} className="w-full rounded bg-accent py-2.5 font-semibold text-black disabled:opacity-50">
          {busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === "in" ? "up" : "in")}
          className="w-full text-center text-xs text-muted hover:text-white"
        >
          {mode === "in" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
