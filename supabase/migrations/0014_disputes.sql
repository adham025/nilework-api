-- 0014_disputes — Transparent, time-boxed, human-reviewed disputes (slice #17, §7).
-- Either party can open a dispute on a funded/delivered order, which moves it to
-- 'disputed' (excluded from the settle-holds auto-release sweep) until staff resolve
-- it — releasing escrow to the freelancer or refunding the client. One dispute per
-- order. Service-role writes; parties read their own.

create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete cascade,
  opened_by uuid not null references public.profiles (id),
  opener_role text not null check (opener_role in ('client', 'freelancer')),
  reason text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolution text check (resolution in ('release', 'refund')),
  resolution_note text,
  resolved_by uuid references public.staff_users (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_disputes_status on public.disputes (status, created_at);

drop trigger if exists trg_disputes_updated_at on public.disputes;
create trigger trg_disputes_updated_at
  before update on public.disputes
  for each row execute function public.set_updated_at();

alter table public.disputes enable row level security;

drop policy if exists disputes_select_party on public.disputes;
create policy disputes_select_party on public.disputes
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = disputes.order_id
        and (auth.uid() = o.client_id or auth.uid() = o.freelancer_id)
    )
  );
