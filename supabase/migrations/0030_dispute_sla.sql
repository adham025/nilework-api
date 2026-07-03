-- 0030_dispute_sla — Published dispute-resolution SLA (Phase 2: transparent
-- dispute center). Every dispute carries a resolution target visible to BOTH
-- parties and staff: the same clock everyone can see. 72 hours is the
-- published Phase-2 commitment; staff queues highlight overdue disputes.

alter table public.disputes
  add column if not exists resolve_due_at timestamptz not null
    default (now() + interval '72 hours');

-- Backfill any pre-SLA open disputes to a fresh 72h window from now.
update public.disputes
  set resolve_due_at = now() + interval '72 hours'
  where status = 'open' and resolve_due_at is null;

create index if not exists idx_disputes_open_due
  on public.disputes (resolve_due_at)
  where status = 'open';
