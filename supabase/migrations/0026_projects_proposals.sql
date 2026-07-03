-- 0026_projects_proposals — Client-posted projects + freelancer proposals
-- (client-projects-week3b). The reverse marketplace to the gig catalog: a
-- client describes work and a budget; freelancers bid with structured
-- proposals; accepting a proposal creates a normal escrow order (reusing the
-- orders engine — no second checkout path). Public browse reads open projects;
-- proposals are visible only to their freelancer and the project's client.
-- Writes go through the API (service-role).

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id),
  category_id uuid not null references public.categories (id),
  title text not null check (char_length(title) between 8 and 120),
  description text not null check (char_length(description) between 30 and 5000),
  -- Budget in USD minor units (§8: USD canonical). Fixed = min == max.
  budget_min_usd_minor bigint not null check (budget_min_usd_minor >= 500),
  budget_max_usd_minor bigint not null check (budget_max_usd_minor >= budget_min_usd_minor),
  expected_delivery_days int not null check (expected_delivery_days between 1 and 365),
  status text not null default 'open' check (status in (
    'open',        -- accepting proposals
    'in_review',   -- client stopped intake, reviewing proposals
    'awarded',     -- a proposal was accepted → order created
    'closed',      -- client closed without awarding
    'cancelled'    -- removed by client/admin
  )),
  awarded_order_id uuid references public.orders (id),
  proposal_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_projects_updated_at on public.projects;
create trigger trg_projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create index if not exists idx_projects_browse
  on public.projects (status, created_at desc);
create index if not exists idx_projects_category
  on public.projects (category_id, status, created_at desc);
create index if not exists idx_projects_client
  on public.projects (client_id, created_at desc);

alter table public.projects enable row level security;

-- Open/in-review projects are publicly browsable; clients always see their own.
drop policy if exists projects_read_public on public.projects;
create policy projects_read_public on public.projects
  for select using (
    status in ('open', 'in_review', 'awarded') or client_id = auth.uid()
  );

create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  freelancer_id uuid not null references public.profiles (id),
  cover_letter text not null check (char_length(cover_letter) between 30 and 3000),
  price_usd_minor bigint not null check (price_usd_minor >= 500),
  delivery_days int not null check (delivery_days between 1 and 365),
  status text not null default 'pending' check (status in (
    'pending',     -- awaiting client decision
    'shortlisted', -- client marked for closer look
    'accepted',    -- won → order created
    'declined',    -- client passed
    'withdrawn'    -- freelancer pulled out
  )),
  order_id uuid references public.orders (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One proposal per freelancer per project (Req 8); revise, don't duplicate.
  unique (project_id, freelancer_id)
);

drop trigger if exists trg_proposals_updated_at on public.proposals;
create trigger trg_proposals_updated_at
  before update on public.proposals
  for each row execute function public.set_updated_at();

create index if not exists idx_proposals_project
  on public.proposals (project_id, status, created_at);
create index if not exists idx_proposals_freelancer
  on public.proposals (freelancer_id, created_at desc);

alter table public.proposals enable row level security;

-- A proposal is private to its author and the project's client (Req 9/13).
drop policy if exists proposals_read_parties on public.proposals;
create policy proposals_read_parties on public.proposals
  for select using (
    freelancer_id = auth.uid()
    or exists (
      select 1 from public.projects p
      where p.id = project_id and p.client_id = auth.uid()
    )
  );
