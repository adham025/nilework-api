-- 0028_identity_duplicates_audit_log — two trust/safety foundations:
--
-- 1) Duplicate national-ID detection (identity-verification-system Req 8 /
--    promo abuse prevention): the national ID is additionally stored as a keyed
--    HMAC-SHA256 hash so the same ID on a second account can be caught by exact
--    hash lookup without ever exposing plaintext. New submissions matching an
--    APPROVED verification on another profile are flagged for the reviewer
--    (flagged_duplicate) rather than silently processed.
--
-- 2) Append-only staff audit log (admin-ops-portal-phase1 Req 10): every
--    sensitive admin action (identity review, payment refund, FX override, ...)
--    is recorded immutably. UPDATE/DELETE are blocked by trigger; RLS is on
--    with no policies (deny-all to clients — service-role writes only).

alter table public.id_verifications
  add column if not exists national_id_hash text,
  add column if not exists flagged_duplicate boolean not null default false;

-- Exact-match duplicate lookup among approved verifications only.
create index if not exists idx_id_verifications_hash_approved
  on public.id_verifications (national_id_hash)
  where status = 'approved';

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  staff_user_id uuid not null references public.staff_users (id),
  action text not null,
  resource_type text not null,
  resource_id text,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_log_staff on public.audit_log (staff_user_id, created_at desc);
create index if not exists idx_audit_log_resource on public.audit_log (resource_type, resource_id);
create index if not exists idx_audit_log_time on public.audit_log (created_at desc);

-- Append-only: block UPDATE/DELETE at the database level.
create or replace function public.audit_log_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only';
end $$;

drop trigger if exists trg_audit_log_immutable on public.audit_log;
create trigger trg_audit_log_immutable
  before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();

alter table public.audit_log enable row level security;
