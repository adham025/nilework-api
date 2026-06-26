-- 0006_payouts — Withdrawals to EGP rails (slice #6, §6).
-- The outbound half of the money loop: a freelancer withdraws their available
-- balance to InstaPay / Vodafone Cash / bank. Requesting debits the wallet's
-- available balance immediately (reserving the funds via post_ledger_entry, 0003);
-- a cancel or failure credits it back with payout_reversal; 'paid' is final and
-- moves no money (it already left on request). Settlement is a staff/ops action
-- (§6.2). Service-role only writes; owner-reads-own via RLS.

create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id),
  amount_usd_minor bigint not null check (amount_usd_minor > 0),
  amount_egp_minor bigint not null check (amount_egp_minor >= 0),
  fx_rate_id uuid references public.fx_rates (id),
  destination_type text not null check (destination_type in ('instapay', 'vodafone_cash', 'bank')),
  destination_details text not null,
  status text not null default 'requested' check (status in (
    'requested', 'processing', 'paid', 'failed', 'cancelled'
  )),
  provider_ref text,
  note text,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payouts_profile on public.payouts (profile_id, created_at desc);
-- Drives the staff "pending payouts" queue.
create index if not exists idx_payouts_status on public.payouts (status, created_at);

drop trigger if exists trg_payouts_updated_at on public.payouts;
create trigger trg_payouts_updated_at
  before update on public.payouts
  for each row execute function public.set_updated_at();

alter table public.payouts enable row level security;

drop policy if exists payouts_select_own on public.payouts;
create policy payouts_select_own on public.payouts
  for select using (auth.uid() = profile_id);
