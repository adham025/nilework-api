-- 0001_init_identity — Identity & onboarding foundation (MASTER_PLAN slice #1, §6.2).
-- Profiles for user-facing roles (client/freelancer, both allowed) + isolated staff table.
-- Deny-by-default RLS; profile writes go through the API (service-role), never the client.

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles — one row per auth user; created by the API on first authenticated
-- request (not a DB trigger), so no elevated auth.users privileges are needed.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  locale text not null default 'ar' check (locale in ('ar', 'en')),
  is_client boolean not null default false,
  is_freelancer boolean not null default false,
  headline text,
  bio text,
  country text,
  avatar_url text,
  phone text,
  phone_verified boolean not null default false,
  id_verification_status text not null default 'unverified'
    check (id_verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

-- A user may read and update only their own profile. Inserts happen via the
-- API's service-role connection (which bypasses RLS), so no client insert policy.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- staff_users — isolated from profiles on purpose (MASTER_PLAN §6.2).
-- Highest-privilege surface; never shares a table/session with public users.
-- RLS on with no policies => deny-all to clients; only the service-role reaches it.
-- ---------------------------------------------------------------------------
create table if not exists public.staff_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  email text unique not null,
  staff_role text not null
    check (staff_role in ('super_admin', 'support', 'finance_ops', 'trust_safety', 'content_editor')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_staff_users_updated_at on public.staff_users;
create trigger trg_staff_users_updated_at
  before update on public.staff_users
  for each row execute function public.set_updated_at();

alter table public.staff_users enable row level security;
