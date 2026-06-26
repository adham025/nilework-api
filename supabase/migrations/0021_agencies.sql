-- 0021_agencies — Agency / team accounts (slice #31, Phase 3). A freelancer runs
-- an agency and adds members by their referral code (reusing profiles.referral_code
-- from 0011). One agency per owner; a person belongs to at most one agency. Members
-- read their own roster via RLS; writes go through the API (service-role).

create table if not exists public.agencies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_agencies_updated_at on public.agencies;
create trigger trg_agencies_updated_at
  before update on public.agencies
  for each row execute function public.set_updated_at();

alter table public.agencies enable row level security;

create table if not exists public.agency_members (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  unique (agency_id, profile_id)
);

create index if not exists idx_agency_members_agency on public.agency_members (agency_id);

alter table public.agency_members enable row level security;

-- A member can read the roster of the agency they belong to.
drop policy if exists agency_members_select_roster on public.agency_members;
create policy agency_members_select_roster on public.agency_members
  for select using (
    agency_id in (select agency_id from public.agency_members where profile_id = auth.uid())
  );

drop policy if exists agencies_select_member on public.agencies;
create policy agencies_select_member on public.agencies
  for select using (
    id in (select agency_id from public.agency_members where profile_id = auth.uid())
  );
