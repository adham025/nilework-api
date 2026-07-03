-- 0027_payment_refunds_webhooks — Kashier-primary payment hardening
-- (payment-integration-phase1, founder decision: Kashier is the launch gateway).
-- 1) payments.status gains 'refunded' so the provider-side money return is a
--    first-class state (dispute resolution previously reversed escrow internally
--    but the card refund was an untracked off-platform step).
-- 2) payment_webhooks: append-only audit of every provider callback (raw payload
--    + signature + verification/processing outcome) so webhooks can be debugged
--    and replayed. Service-role only; deny-all RLS.

alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in ('initiated', 'paid', 'failed', 'refunded'));

alter table public.payments add column if not exists refunded_at timestamptz;
alter table public.payments add column if not exists refund_ref text;

create table if not exists public.payment_webhooks (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('paymob', 'kashier', 'simulated')),
  payment_id uuid references public.payments (id),
  payload jsonb not null,
  signature text,
  verified boolean not null default false,
  processed boolean not null default false,
  processing_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists idx_payment_webhooks_payment
  on public.payment_webhooks (payment_id);
create index if not exists idx_payment_webhooks_created
  on public.payment_webhooks (created_at desc);

-- RLS on, no policies => deny-all to clients; only the service role reaches it.
alter table public.payment_webhooks enable row level security;
