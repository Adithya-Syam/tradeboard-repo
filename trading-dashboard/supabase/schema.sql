-- Tradeboard schema. Run this once in the Supabase SQL editor.
-- Every table is protected by row-level security so users only see their own data.

create table if not exists public.accounts (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  cash       numeric(20, 8) not null default 100000 check (cash >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.positions (
  user_id   uuid not null references auth.users (id) on delete cascade,
  symbol    text not null,
  quantity  numeric(28, 10) not null check (quantity > 0),
  avg_price numeric(20, 8) not null check (avg_price > 0),
  primary key (user_id, symbol)
);

create table if not exists public.orders (
  id           uuid primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  symbol       text not null,
  side         text not null check (side in ('buy', 'sell')),
  type         text not null check (type in ('market', 'limit')),
  quantity     numeric(28, 10) not null check (quantity > 0),
  limit_price  numeric(20, 8),
  status       text not null check (status in ('open', 'filled', 'cancelled', 'rejected')),
  filled_price numeric(20, 8),
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint limit_needs_price check (type = 'market' or limit_price is not null)
);

create index if not exists orders_user_created_idx on public.orders (user_id, created_at desc);
create index if not exists orders_open_idx on public.orders (user_id) where status = 'open';

create table if not exists public.watchlist (
  user_id  uuid not null references auth.users (id) on delete cascade,
  symbol   text not null,
  position int  not null default 0,
  primary key (user_id, symbol)
);

alter table public.accounts  enable row level security;
alter table public.positions enable row level security;
alter table public.orders    enable row level security;
alter table public.watchlist enable row level security;

do $$
declare t text;
begin
  foreach t in array array['accounts', 'positions', 'orders', 'watchlist'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;
