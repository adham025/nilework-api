-- 0011_gamification — Phase-1 engagement hooks (slice #11, §5.3).
-- The cheapest intent-aligning mechanics: an append-only points ledger (the §5.3
-- substrate — earn now, redemption catalog is Phase 2), first-milestone achievement
-- badges, and the two-sided referral loop (the lowest-CAC growth channel). Every
-- balance is append-only + derived, idempotent, and emits a notification (0010).

-- Referral code per profile, generated lazily by the API (like the profile itself).
alter table public.profiles add column if not exists referral_code text unique;

-- ---------------------------------------------------------------------------
-- points_ledger — append-only earn log; balance is the derived sum (§5.1 pattern).
-- ---------------------------------------------------------------------------
create table if not exists public.points_ledger (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  points int not null check (points <> 0),
  reason text not null,
  reference_type text,
  reference_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_points_ledger_profile on public.points_ledger (profile_id, created_at desc);

drop trigger if exists trg_points_ledger_immutable on public.points_ledger;
create trigger trg_points_ledger_immutable
  before update or delete on public.points_ledger
  for each row execute function public.forbid_mutation();

alter table public.points_ledger enable row level security;

drop policy if exists points_ledger_select_own on public.points_ledger;
create policy points_ledger_select_own on public.points_ledger
  for select using (auth.uid() = profile_id);

-- ---------------------------------------------------------------------------
-- user_achievements — earned milestone badges (metadata lives in code). One row
-- per (profile, key); the UNIQUE is what makes awarding idempotent.
-- ---------------------------------------------------------------------------
create table if not exists public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  achievement_key text not null,
  created_at timestamptz not null default now(),
  unique (profile_id, achievement_key)
);

create index if not exists idx_user_achievements_profile on public.user_achievements (profile_id, created_at);

alter table public.user_achievements enable row level security;

drop policy if exists user_achievements_select_own on public.user_achievements;
create policy user_achievements_select_own on public.user_achievements
  for select using (auth.uid() = profile_id);

-- ---------------------------------------------------------------------------
-- referrals — one referrer → one referred (UNIQUE referred_id), qualifies on the
-- referred user's first completed order; both sides earn points then (§5.3).
-- ---------------------------------------------------------------------------
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles (id) on delete cascade,
  referred_id uuid not null unique references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'qualified')),
  points_awarded int not null default 0,
  qualified_at timestamptz,
  created_at timestamptz not null default now(),
  check (referrer_id <> referred_id)
);

create index if not exists idx_referrals_referrer on public.referrals (referrer_id, created_at desc);

alter table public.referrals enable row level security;

drop policy if exists referrals_select_party on public.referrals;
create policy referrals_select_party on public.referrals
  for select using (auth.uid() = referrer_id or auth.uid() = referred_id);
