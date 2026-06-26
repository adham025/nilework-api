-- 0003_money_foundation — Wallets, append-only ledger, FX, config (slice #3, §6).
-- The money substrate every later money feature (escrow, payouts, promos, loyalty)
-- builds on. Core invariant: a wallet's materialized balances are moved ONLY by
-- public.post_ledger_entry(), which appends an immutable ledger row in the SAME
-- transaction — the single audited "append-only ledger + derived balance" pattern
-- reused for all balances (§5.1). Deny-by-default RLS; the API (service-role) is the
-- only writer to these tables.

-- ---------------------------------------------------------------------------
-- forbid_mutation — generic guard for append-only tables. INSERT only; any
-- UPDATE/DELETE raises, even from the privileged service-role connection (which
-- bypasses RLS). This is the real immutability guarantee, not just RLS.
-- ---------------------------------------------------------------------------
create or replace function public.forbid_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'public.% is append-only; % is not permitted', tg_table_name, tg_op;
end;
$$;

-- ---------------------------------------------------------------------------
-- app_config — platform-wide settings (commission, holds, limits). Service-role
-- only; safe subset is exposed publicly via the API (/v1/config/public).
-- ---------------------------------------------------------------------------
create table if not exists public.app_config (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_app_config_updated_at on public.app_config;
create trigger trg_app_config_updated_at
  before update on public.app_config
  for each row execute function public.set_updated_at();

alter table public.app_config enable row level security;

-- The headline economics from §1, as config not hardcoded constants.
insert into public.app_config (key, value, description) values
  ('commission_bps',           '1000'::jsonb, 'Platform commission in basis points (1000 = 10% flat, §1).'),
  ('payout_hold_days',         '3'::jsonb,    'Days escrow is held before becoming withdrawable (§1).'),
  ('min_withdrawal_usd_minor', '1000'::jsonb, 'Minimum withdrawal in USD minor units ($10, §1).')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- fx_rates — point-in-time USD<->EGP snapshots; append-only history so any past
-- transaction's rate stays auditable forever (§6). RLS deny-all; served via API.
-- ---------------------------------------------------------------------------
create table if not exists public.fx_rates (
  id uuid primary key default gen_random_uuid(),
  base_currency text not null default 'USD' check (base_currency in ('USD', 'EGP')),
  quote_currency text not null default 'EGP' check (quote_currency in ('USD', 'EGP')),
  rate numeric(18, 6) not null check (rate > 0),
  source text not null,
  captured_at timestamptz not null default now(),
  check (base_currency <> quote_currency)
);

create index if not exists idx_fx_rates_pair_time
  on public.fx_rates (base_currency, quote_currency, captured_at desc);

drop trigger if exists trg_fx_rates_immutable on public.fx_rates;
create trigger trg_fx_rates_immutable
  before update or delete on public.fx_rates
  for each row execute function public.forbid_mutation();

alter table public.fx_rates enable row level security;

-- Placeholder rate so the API has something to serve before the live feed lands
-- (Phase 1: "replace placeholder rate"). source flags it as non-market-sourced.
insert into public.fx_rates (base_currency, quote_currency, rate, source)
values ('USD', 'EGP', 49.000000, 'seed_placeholder')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- wallets — one per profile. Canonical USD minor units. balance = withdrawable,
-- pending = held in escrow (§6). bigint (not int4) so a lifetime of accumulated
-- earnings can never overflow. CHECK (>= 0) is the atomic no-overdraft guard.
-- ---------------------------------------------------------------------------
create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  balance_usd_minor bigint not null default 0 check (balance_usd_minor >= 0),
  pending_usd_minor bigint not null default 0 check (pending_usd_minor >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_wallets_updated_at on public.wallets;
create trigger trg_wallets_updated_at
  before update on public.wallets
  for each row execute function public.set_updated_at();

alter table public.wallets enable row level security;

-- A user may read only their own wallet balances. All writes flow through the API
-- service-role via post_ledger_entry(); no client insert/update policy exists.
drop policy if exists wallets_select_own on public.wallets;
create policy wallets_select_own on public.wallets
  for select using (auth.uid() = profile_id);

-- ---------------------------------------------------------------------------
-- ledger_entries — immutable, append-only source of truth for every money move.
-- Signed amount: positive credits the bucket, negative debits it. Polymorphic
-- reference_type/reference_id links an entry to its order/payout/promo cause.
-- ---------------------------------------------------------------------------
create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets (id),
  profile_id uuid not null references public.profiles (id),
  entry_type text not null check (entry_type in (
    'escrow_fund', 'escrow_release', 'escrow_refund', 'commission',
    'payout', 'payout_reversal', 'promo_credit', 'adjustment'
  )),
  bucket text not null check (bucket in ('available', 'pending')),
  amount_usd_minor bigint not null check (amount_usd_minor <> 0),
  reference_type text,
  reference_id uuid,
  fx_rate_id uuid references public.fx_rates (id),
  memo text,
  created_at timestamptz not null default now()
);

create index if not exists idx_ledger_wallet_time on public.ledger_entries (wallet_id, created_at desc);
create index if not exists idx_ledger_profile_time on public.ledger_entries (profile_id, created_at desc);
create index if not exists idx_ledger_reference on public.ledger_entries (reference_type, reference_id);

drop trigger if exists trg_ledger_immutable on public.ledger_entries;
create trigger trg_ledger_immutable
  before update or delete on public.ledger_entries
  for each row execute function public.forbid_mutation();

alter table public.ledger_entries enable row level security;

drop policy if exists ledger_select_own on public.ledger_entries;
create policy ledger_select_own on public.ledger_entries
  for select using (auth.uid() = profile_id);

-- ---------------------------------------------------------------------------
-- post_ledger_entry — the ONLY sanctioned way money moves. Appends an immutable
-- ledger row and shifts the wallet's matching materialized balance in one atomic
-- transaction. The wallet's CHECK (>= 0) constraints reject any overdraft. The
-- FOR UPDATE row lock serializes concurrent posts to the same wallet, so no two
-- transactions can lose each other's update. Every later money flow calls this —
-- never a hand-written balance UPDATE (§5.1, §6).
-- ---------------------------------------------------------------------------
create or replace function public.post_ledger_entry(
  p_wallet_id uuid,
  p_entry_type text,
  p_bucket text,
  p_amount_usd_minor bigint,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_fx_rate_id uuid default null,
  p_memo text default null
)
returns public.ledger_entries
language plpgsql
as $$
declare
  v_profile_id uuid;
  v_entry public.ledger_entries;
begin
  -- Lock the wallet row first so concurrent posts serialize cleanly.
  select profile_id into v_profile_id
  from public.wallets
  where id = p_wallet_id
  for update;

  if v_profile_id is null then
    raise exception 'wallet % not found', p_wallet_id;
  end if;

  insert into public.ledger_entries
    (wallet_id, profile_id, entry_type, bucket, amount_usd_minor,
     reference_type, reference_id, fx_rate_id, memo)
  values
    (p_wallet_id, v_profile_id, p_entry_type, p_bucket, p_amount_usd_minor,
     p_reference_type, p_reference_id, p_fx_rate_id, p_memo)
  returning * into v_entry;

  if p_bucket = 'available' then
    update public.wallets
      set balance_usd_minor = balance_usd_minor + p_amount_usd_minor
      where id = p_wallet_id;
  else
    update public.wallets
      set pending_usd_minor = pending_usd_minor + p_amount_usd_minor
      where id = p_wallet_id;
  end if;

  return v_entry;
end;
$$;

-- ---------------------------------------------------------------------------
-- wallet_reconciliation — audit view: materialized wallet balances vs. the ledger
-- sum. Any nonzero *_drift is a bug or tamper signal for the reconciliation worker
-- job (later slice). Service-role/admin use only; not exposed to clients.
-- ---------------------------------------------------------------------------
create or replace view public.wallet_reconciliation as
select
  w.id as wallet_id,
  w.profile_id,
  w.balance_usd_minor,
  w.pending_usd_minor,
  coalesce(sum(l.amount_usd_minor) filter (where l.bucket = 'available'), 0) as ledger_available,
  coalesce(sum(l.amount_usd_minor) filter (where l.bucket = 'pending'), 0) as ledger_pending,
  w.balance_usd_minor
    - coalesce(sum(l.amount_usd_minor) filter (where l.bucket = 'available'), 0) as available_drift,
  w.pending_usd_minor
    - coalesce(sum(l.amount_usd_minor) filter (where l.bucket = 'pending'), 0) as pending_drift
from public.wallets w
left join public.ledger_entries l on l.wallet_id = w.id
group by w.id;
