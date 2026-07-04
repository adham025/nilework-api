-- 0032_risk_signals — Fraud/scam signal store (Phase 4: backend intelligence).
-- Append-only record of automated risk detections (off-platform contact/payment
-- luring in messages, velocity anomalies, ...). Signals NEVER block the user
-- action that triggered them — they feed the staff review queue; humans decide.
-- Deny-all RLS: staff read via the API, writes via service role only.

create table if not exists public.risk_signals (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in (
    'off_platform_contact',   -- phone/email/social handles in chat
    'off_platform_payment',   -- wallet/IBAN/pay-outside luring
    'velocity'                -- reserved: unusual activity bursts
  )),
  severity text not null check (severity in ('low', 'medium', 'high')),
  source_type text not null check (source_type in ('message', 'offer', 'proposal', 'system')),
  source_id uuid,
  -- What matched, for the reviewer (pattern label + a short excerpt).
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_risk_signals_profile
  on public.risk_signals (profile_id, created_at desc);
create index if not exists idx_risk_signals_recent
  on public.risk_signals (created_at desc);

-- Append-only, same posture as audit_log.
create or replace function public.risk_signals_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'risk_signals is append-only';
end $$;

drop trigger if exists trg_risk_signals_immutable on public.risk_signals;
create trigger trg_risk_signals_immutable
  before update or delete on public.risk_signals
  for each row execute function public.risk_signals_immutable();

alter table public.risk_signals enable row level security;
