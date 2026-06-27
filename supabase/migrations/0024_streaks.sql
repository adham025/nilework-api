-- 0024_streaks — Activity streaks (slice #34, §5.3 gamification). A daily heartbeat
-- builds a streak; milestones grant points through the existing points_ledger. The
-- monthly leaderboard is a read-only aggregate over points_ledger (no new table).

create table if not exists public.activity_streaks (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_active_date date,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_activity_streaks_updated_at on public.activity_streaks;
create trigger trg_activity_streaks_updated_at
  before update on public.activity_streaks
  for each row execute function public.set_updated_at();

alter table public.activity_streaks enable row level security;

drop policy if exists activity_streaks_select_own on public.activity_streaks;
create policy activity_streaks_select_own on public.activity_streaks
  for select using (auth.uid() = profile_id);
