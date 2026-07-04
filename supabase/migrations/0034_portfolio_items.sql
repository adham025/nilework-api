-- 0034_portfolio_items — Freelancer portfolio with GitHub import (closes the
-- Phase-1 deferral). Items are public marketing content shown on the
-- freelancer's profile; the GitHub source uses the keyless public API, so no
-- credentials are involved. unique(profile_id, url) makes re-imports
-- idempotent. Public read; writes via the API (owner-authorized).

create table if not exists public.portfolio_items (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  source text not null check (source in ('github', 'manual')),
  title text not null check (char_length(title) between 1 and 160),
  description text,
  url text not null check (char_length(url) <= 400),
  -- Source-specific extras (e.g. GitHub: language, stars).
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (profile_id, url)
);

create index if not exists idx_portfolio_profile
  on public.portfolio_items (profile_id, created_at desc);

alter table public.portfolio_items enable row level security;

-- Portfolio is public content by design.
drop policy if exists portfolio_read_all on public.portfolio_items;
create policy portfolio_read_all on public.portfolio_items
  for select using (true);
