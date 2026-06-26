-- 0020_hourly_contracts — Hourly contracts + time tracking (slice #30, Phase 3).
-- A client hires a freelancer at an hourly rate; the freelancer logs time, the
-- client approves logs, and billing approved hours generates a normal order
-- (reusing the escrow/ledger flow — no second billing engine). Party-readable;
-- writes via the API (service-role).

create table if not exists public.hourly_contracts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id),
  freelancer_id uuid not null references public.profiles (id),
  title text not null,
  hourly_rate_usd_minor bigint not null check (hourly_rate_usd_minor > 0),
  status text not null default 'active' check (status in ('active', 'ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (client_id <> freelancer_id)
);

create index if not exists idx_hourly_client on public.hourly_contracts (client_id, created_at desc);
create index if not exists idx_hourly_freelancer on public.hourly_contracts (freelancer_id, created_at desc);

drop trigger if exists trg_hourly_updated_at on public.hourly_contracts;
create trigger trg_hourly_updated_at
  before update on public.hourly_contracts
  for each row execute function public.set_updated_at();

alter table public.hourly_contracts enable row level security;

drop policy if exists hourly_select_party on public.hourly_contracts;
create policy hourly_select_party on public.hourly_contracts
  for select using (auth.uid() = client_id or auth.uid() = freelancer_id);

create table if not exists public.time_logs (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.hourly_contracts (id) on delete cascade,
  minutes int not null check (minutes > 0),
  description text not null,
  status text not null default 'logged' check (status in ('logged', 'approved', 'billed')),
  order_id uuid references public.orders (id),
  created_at timestamptz not null default now()
);

create index if not exists idx_time_logs_contract on public.time_logs (contract_id, created_at);

alter table public.time_logs enable row level security;

drop policy if exists time_logs_select_party on public.time_logs;
create policy time_logs_select_party on public.time_logs
  for select using (
    exists (
      select 1 from public.hourly_contracts c
      where c.id = time_logs.contract_id
        and (auth.uid() = c.client_id or auth.uid() = c.freelancer_id)
    )
  );
