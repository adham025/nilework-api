-- 0005_payments — Payment attempts via Paymob (slice #5, §6).
-- One row per checkout attempt on an order. The verified Paymob webhook is the
-- only thing that flips an order to 'funded' in production; this table gives the
-- webhook idempotency (unique provider_txn_id / provider_order_id) and an audit
-- trail of what was charged in EGP at which FX rate. Service-role only (no client
-- reads needed); the API mediates everything.

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  provider text not null default 'paymob' check (provider in ('paymob', 'simulated')),
  -- merchant_order_id we send to the gateway; unique forever (Paymob requires it).
  merchant_ref text not null unique,
  provider_order_id text unique,
  provider_txn_id text unique,
  amount_usd_minor bigint not null check (amount_usd_minor >= 0),
  amount_egp_minor bigint not null check (amount_egp_minor >= 0),
  fx_rate_id uuid references public.fx_rates (id),
  status text not null default 'initiated' check (status in ('initiated', 'paid', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payments_order on public.payments (order_id, created_at desc);

drop trigger if exists trg_payments_updated_at on public.payments;
create trigger trg_payments_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

alter table public.payments enable row level security;
