-- 0023_api_keys — Public API keys (slice #33, Phase 3 §5/§6.1). A user issues keys
-- to call the API programmatically as themselves (the same surface a Flutter client
-- or external integration would use). Only the SHA-256 hash is stored; the plaintext
-- key is shown once at creation. Owner-readable; the auth layer looks up by hash.

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  key_hash text not null unique,
  prefix text not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_api_keys_profile on public.api_keys (profile_id, created_at desc);

alter table public.api_keys enable row level security;

drop policy if exists api_keys_select_own on public.api_keys;
create policy api_keys_select_own on public.api_keys
  for select using (auth.uid() = profile_id);
