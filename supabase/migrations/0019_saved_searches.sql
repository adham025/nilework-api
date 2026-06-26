-- 0019_saved_searches — Saved browse filters (slice #29, Phase 2 discovery). A
-- client saves a set of gig filters to re-run later. Stored as a jsonb param map.
-- Owner-readable; writes via the API (service-role).

create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  label text not null,
  query jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_saved_searches_profile on public.saved_searches (profile_id, created_at desc);

alter table public.saved_searches enable row level security;

drop policy if exists saved_searches_select_own on public.saved_searches;
create policy saved_searches_select_own on public.saved_searches
  for select using (auth.uid() = profile_id);
