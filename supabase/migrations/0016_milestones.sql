-- 0016_milestones — Milestone-based contracts (slice #25, Phase 2). A funded
-- order's escrowed net can be split into milestones the freelancer delivers and the
-- client releases independently, so payment flows as work progresses. Amounts sum
-- to the order's net; each milestone releases its portion (pending → available) via
-- the same ledger primitive. Party-readable; writes via the API (service-role).

create table if not exists public.milestones (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  title text not null,
  amount_usd_minor bigint not null check (amount_usd_minor > 0),
  sequence int not null,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'released')),
  delivered_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_milestones_order on public.milestones (order_id, sequence);

drop trigger if exists trg_milestones_updated_at on public.milestones;
create trigger trg_milestones_updated_at
  before update on public.milestones
  for each row execute function public.set_updated_at();

alter table public.milestones enable row level security;

drop policy if exists milestones_select_party on public.milestones;
create policy milestones_select_party on public.milestones
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = milestones.order_id
        and (auth.uid() = o.client_id or auth.uid() = o.freelancer_id)
    )
  );
