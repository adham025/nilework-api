-- 0015_favorites — Saved gigs (slice #23, Phase 2). A lightweight re-engagement
-- hook: a client saves gigs to revisit. One row per (profile, gig). Owner reads
-- own; writes via the API (service-role).

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  gig_id uuid not null references public.gigs (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (profile_id, gig_id)
);

create index if not exists idx_favorites_profile on public.favorites (profile_id, created_at desc);

alter table public.favorites enable row level security;

drop policy if exists favorites_select_own on public.favorites;
create policy favorites_select_own on public.favorites
  for select using (auth.uid() = profile_id);
