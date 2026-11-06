# Tradeboard — Real-Time Crypto Paper-Trading Dashboard

A web trading platform that streams live market data from Binance and lets users place simulated (paper) trades against it. Every account starts with $100,000 USDT. Users can buy and sell with market or limit orders and track their positions and P&L in real time.

**Stack:** Next.js 14 (App Router) · TypeScript · React · Tailwind CSS · Supabase (Postgres + Auth) · Binance WebSocket API · TradingView Lightweight Charts · Vitest

## Features

- **Live market data:** a watchlist with 24h price, change and volume, streamed over WebSockets. Symbols can be added or removed (each is checked against Binance before it's added).
- **Candlestick chart:** six timeframes (1m to 1d), volume bars, and live candle updates. Open limit orders are drawn on the chart as price lines.
- **Order book and trade tape:** the top levels of the live book with depth bars, plus recent public trades. Clicking any price copies it into the order form.
- **Order entry:** market and limit orders, buy and sell, with 25/50/75/100% sizing and validation as you type.
- **Order management:**
  - Limit orders fill automatically when the live price crosses the limit.
  - Open orders reserve cash or coins, so the same funds can't be used twice.
  - Orders can be cancelled.
- **Portfolio:** equity, cash, unrealized P&L and total return in the header. A positions table shows average entry price, mark price, value and P&L.
- **Order history:** filled, cancelled and rejected orders, with the reason for any rejection.
- **Resilient feeds:** WebSockets reconnect with exponential backoff, and a status badge shows when the feed is live. High-frequency updates are throttled so the UI stays smooth.
- **Two storage modes:**
  - **Demo mode** (no setup): data is saved in the browser.
  - **Cloud mode**: email/password sign-in, with data stored in Supabase tables protected by row-level security.

## Architecture

```
src/
  lib/
    engine.ts          Pure trading engine: order validation, fills, reservations, P&L
    binance.ts         REST + WebSocket endpoints and payload parsers
    store/             Storage interface with two implementations
      localStore.ts      Demo mode (localStorage)
      supabaseStore.ts   Cloud mode (diff-based sync to Postgres)
  hooks/
    useBinanceStream.ts  Reconnecting WebSocket hook + throttled state
    useMarketData.ts     Tickers, order book and trade feeds
  components/
    TradingProvider.tsx  React context + reducer wrapping the engine
    Dashboard.tsx        Layout and portfolio header
    PriceChart.tsx, OrderBookPanel.tsx, OrderForm.tsx, AccountPanel.tsx, Watchlist.tsx
    App.tsx              Picks demo vs cloud mode, handles sign-in
supabase/schema.sql    Tables, constraints, indexes and RLS policies
tests/engine.test.ts   Unit tests for the trading engine
```

**Design decisions**

- **The engine is pure.** Each function takes the account state and returns a new one, with no side effects. That makes it easy to test, and it lets the same logic run regardless of where data is stored.
- **Storage sits behind an interface** (`TradingStore`). The UI never knows whether it's talking to localStorage or Supabase. The Supabase store writes only the rows that changed (by reference), not the whole account.
- **Market data goes straight from the browser to Binance's public API.** There's no backend proxy and no API key.
- **Fast updates are batched.** Ticker updates are flushed twice a second and the order book four times a second, so a feed sending dozens of messages a second doesn't cause dozens of re-renders.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000. With no environment variables set, the app runs in **demo mode**.

### Enable Supabase (cloud mode)

1. Create a free project at [supabase.com](https://supabase.com).
2. In the SQL editor, run `supabase/schema.sql`.
3. Copy `.env.example` to `.env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Project Settings → API).
4. Restart `npm run dev`. The app now asks users to sign in. For quick testing, you can turn off email confirmation under Authentication → Providers → Email.

### If Binance is blocked in your region

Set these in `.env.local`:

```
NEXT_PUBLIC_BINANCE_REST=https://data-api.binance.vision
NEXT_PUBLIC_BINANCE_WS=wss://data-stream.binance.vision
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm test` | Run the engine unit tests (Vitest) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |

## Deploy

Push the repo to GitHub, import it in [Vercel](https://vercel.com), and add the same environment variables. No other configuration is needed.

## Notes

- This is a simulator: no real orders are sent to any exchange.
- Limit orders are matched against the last traded price and fill in full at the limit price. A real exchange would match against the order book, could fill orders partially, and would charge fees.
- Charts use [TradingView Lightweight Charts](https://www.tradingview.com/lightweight-charts/) (Apache 2.0).
