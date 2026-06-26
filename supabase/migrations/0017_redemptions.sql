-- 0017_redemptions — Loyalty redemption catalog (slice #26, §5.3). The "store"
-- half: spend earned points (points_ledger, 0011) on rewards. Redeeming appends a
-- negative points entry + applies the reward, atomically. Append-only redemptions;
-- catalog + redemptions are service-role only (API-served).

-- Featured visibility window for a gig (the flagship reward).
alter table public.gigs add column if not exists featured_until timestamptz;
create index if not exists idx_gigs_featured on public.gigs (featured_until)
  where featured_until is not null;

create table if not exists public.redemption_catalog (
  key text primary key,
  title_en text not null,
  title_ar text not null,
  cost_points int not null check (cost_points > 0),
  kind text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.redemption_catalog (key, title_en, title_ar, cost_points, kind) values
  ('featured_gig', 'Feature a gig for 7 days', 'تمييز خدمة لمدة 7 أيام', 500, 'featured_gig')
on conflict (key) do nothing;

alter table public.redemption_catalog enable row level security;

create table if not exists public.redemptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  catalog_key text not null references public.redemption_catalog (key),
  cost_points int not null check (cost_points > 0),
  reference_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_redemptions_profile on public.redemptions (profile_id, created_at desc);

drop trigger if exists trg_redemptions_immutable on public.redemptions;
create trigger trg_redemptions_immutable
  before update or delete on public.redemptions
  for each row execute function public.forbid_mutation();

alter table public.redemptions enable row level security;

drop policy if exists redemptions_select_own on public.redemptions;
create policy redemptions_select_own on public.redemptions
  for select using (auth.uid() = profile_id);
