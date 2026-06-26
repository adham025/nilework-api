-- 0013_identity_verification — Phone OTP + national ID KYC (slice #14, §6, §6.2).
-- Phone OTP (WhatsApp-first via CPaaS, SMS fallback — provider behind the API) and
-- Egyptian national-ID review. Documents live in a PRIVATE storage bucket scoped to
-- the owner's folder; staff view them via short-lived signed URLs minted by the API.
-- All tables service-role only; the API is the gatekeeper.

-- ---------------------------------------------------------------------------
-- phone_verifications — short-lived OTP attempts (hashed code), rate-limit source.
-- ---------------------------------------------------------------------------
create table if not exists public.phone_verifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  phone text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_phone_verifications_profile
  on public.phone_verifications (profile_id, created_at desc);

alter table public.phone_verifications enable row level security;

-- ---------------------------------------------------------------------------
-- id_verifications — national-ID submissions + the staff review decision.
-- ---------------------------------------------------------------------------
create table if not exists public.id_verifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  full_name text not null,
  national_id_number text not null,
  front_path text not null,
  back_path text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_by uuid references public.staff_users (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_id_verifications_profile on public.id_verifications (profile_id, created_at desc);
create index if not exists idx_id_verifications_status on public.id_verifications (status, created_at);

alter table public.id_verifications enable row level security;

drop policy if exists id_verifications_select_own on public.id_verifications;
create policy id_verifications_select_own on public.id_verifications
  for select using (auth.uid() = profile_id);

-- ---------------------------------------------------------------------------
-- Private storage bucket for ID documents. Owner uploads/reads only their own
-- folder ({uid}/...); staff read via API-minted signed URLs (service-role).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('identity-docs', 'identity-docs', false)
on conflict (id) do nothing;

drop policy if exists "identity docs owner upload" on storage.objects;
create policy "identity docs owner upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'identity-docs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "identity docs owner read" on storage.objects;
create policy "identity docs owner read" on storage.objects
  for select to authenticated
  using (bucket_id = 'identity-docs' and (storage.foldername(name))[1] = auth.uid()::text);
