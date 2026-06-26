-- 0012_promo — Promo-code engine (slice #12, §5.1, §4.4).
-- The mechanism that actually RUNS the cold-start subsidies: a fee_waiver code is
-- the 0%-commission launch window; a points code grants engagement points (§5.3).
-- Append-only redemptions with a DB-level UNIQUE(code, user) — not just an app
-- check — so a double-click or retry can never double-redeem. Service-role only.

create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  type text not null check (type in ('fee_waiver', 'points')),
  -- fee_waiver: commission bps to waive (10000 = full 0% commission).
  -- points: number of points granted on redemption.
  value int not null check (value > 0),
  max_redemptions int check (max_redemptions is null or max_redemptions > 0),
  redeemed_count int not null default 0,
  per_user_limit int not null default 1 check (per_user_limit > 0),
  starts_at timestamptz,
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.promo_codes enable row level security;

create table if not exists public.promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_code_id uuid not null references public.promo_codes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  order_id uuid references public.orders (id),
  created_at timestamptz not null default now(),
  -- Per-user-once (per_user_limit = 1 for MVP): the real anti-double-redeem guard.
  unique (promo_code_id, user_id)
);

create index if not exists idx_promo_redemptions_user on public.promo_redemptions (user_id);

alter table public.promo_redemptions enable row level security;
