-- 0022_subscriptions — Plans / Pro subscription (slice #32, Phase 3, §5.1). A
-- value-add tier (never pay-to-participate). Modeled as a one-time 30-day window
-- (renew by re-activating) rather than auto-recurring — full recurring billing
-- (dunning/proration) waits for live Paymob. Owner-readable; API-managed.

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  plan text not null default 'pro' check (plan in ('pro')),
  status text not null default 'active' check (status in ('active', 'expired')),
  current_period_end timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_subscriptions_updated_at on public.subscriptions;
create trigger trg_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

alter table public.subscriptions enable row level security;

drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
  for select using (auth.uid() = profile_id);
