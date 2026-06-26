-- 0004_orders_escrow — Orders + the escrow state machine (slice #4, §6).
-- The core money loop: a client funds an order into escrow, the freelancer
-- delivers, funds release to the freelancer's wallet. All money moves through
-- post_ledger_entry() (0003) inside one transaction with the status change, so
-- an order's state and the ledger can never disagree. Money amounts snapshot the
-- commission rate and FX rate at order time, auditable forever (§6).

-- ---------------------------------------------------------------------------
-- orders — one purchase of a gig. Amounts in canonical USD minor units.
--   gross      = what the client pays (the gig price)
--   commission = platform fee (gross * commission_bps / 10000), freelancer-side
--   net        = gross − commission = what reaches the freelancer's wallet
-- Status machine: pending_payment → funded → delivered → released
--                 pending_payment → cancelled
--                 (refunded / disputed reserved for the dispute slice)
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id),
  freelancer_id uuid not null references public.profiles (id),
  gig_id uuid references public.gigs (id),
  title text not null,
  gross_usd_minor bigint not null check (gross_usd_minor >= 0),
  commission_usd_minor bigint not null check (commission_usd_minor >= 0),
  net_usd_minor bigint not null check (net_usd_minor >= 0),
  commission_bps int not null check (commission_bps >= 0),
  fx_rate_id uuid references public.fx_rates (id),
  delivery_days int not null check (delivery_days > 0),
  status text not null default 'pending_payment' check (status in (
    'pending_payment', 'funded', 'delivered', 'released',
    'refunded', 'cancelled', 'disputed'
  )),
  delivered_at timestamptz,
  released_at timestamptz,
  auto_release_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (client_id <> freelancer_id),
  check (gross_usd_minor = commission_usd_minor + net_usd_minor)
);

create index if not exists idx_orders_client on public.orders (client_id, created_at desc);
create index if not exists idx_orders_freelancer on public.orders (freelancer_id, created_at desc);
-- Drives the settle-holds auto-release sweep (worker).
create index if not exists idx_orders_auto_release on public.orders (status, auto_release_at);

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

alter table public.orders enable row level security;

-- A party (client or freelancer) may read their own orders. All writes flow
-- through the API service-role state machine; no client write policy.
drop policy if exists orders_select_party on public.orders;
create policy orders_select_party on public.orders
  for select using (auth.uid() = client_id or auth.uid() = freelancer_id);

-- ---------------------------------------------------------------------------
-- order_events — append-only audit trail of every state transition. Powers the
-- transparent, time-boxed order/dispute timeline promised in §1/§7.
-- ---------------------------------------------------------------------------
create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_id uuid references public.profiles (id),
  actor_role text not null check (actor_role in ('client', 'freelancer', 'system')),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_events_order on public.order_events (order_id, created_at);

drop trigger if exists trg_order_events_immutable on public.order_events;
create trigger trg_order_events_immutable
  before update or delete on public.order_events
  for each row execute function public.forbid_mutation();

alter table public.order_events enable row level security;

drop policy if exists order_events_select_party on public.order_events;
create policy order_events_select_party on public.order_events
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_events.order_id
        and (auth.uid() = o.client_id or auth.uid() = o.freelancer_id)
    )
  );
