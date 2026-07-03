-- 0029_dispute_messages — Transparent dispute center (Phase 2: Trust & Quality).
-- Phase 1 disputes carried a single opener `reason` and staff resolved blind.
-- This adds an append-only statement/evidence thread on each dispute: both
-- parties state their case (with optional evidence attachments from private
-- storage) and staff participate visibly, so the resolution record shows WHY.
-- Append-only by trigger — dispute history can never be rewritten.

create table if not exists public.dispute_messages (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes (id) on delete cascade,
  author_id uuid not null,
  author_role text not null check (author_role in ('client', 'freelancer', 'staff')),
  body text not null check (char_length(body) between 1 and 3000),
  -- Optional evidence: a storage key in the private dispute-evidence bucket.
  attachment_path text,
  created_at timestamptz not null default now()
);

create index if not exists idx_dispute_messages_dispute
  on public.dispute_messages (dispute_id, created_at);

-- Append-only: block UPDATE/DELETE at the database level (same posture as audit_log).
create or replace function public.dispute_messages_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'dispute_messages is append-only';
end $$;

drop trigger if exists trg_dispute_messages_immutable on public.dispute_messages;
create trigger trg_dispute_messages_immutable
  before update or delete on public.dispute_messages
  for each row execute function public.dispute_messages_immutable();

alter table public.dispute_messages enable row level security;

-- Both parties of the disputed order can read the thread; writes via the API.
drop policy if exists dispute_messages_read_parties on public.dispute_messages;
create policy dispute_messages_read_parties on public.dispute_messages
  for select using (
    exists (
      select 1
      from public.disputes d
      join public.orders o on o.id = d.order_id
      where d.id = dispute_id
        and (o.client_id = auth.uid() or o.freelancer_id = auth.uid())
    )
  );
