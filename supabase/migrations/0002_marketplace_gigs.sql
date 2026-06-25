-- 0002_marketplace_gigs — Categories + gigs (MASTER_PLAN slice #2, §5).
-- Reads that need joins/privacy-filtering (gig + freelancer public info) are served
-- by the API via the service-role connection, so RLS stays deny-by-default here
-- (no client policies) — the API is the gatekeeper for these tables (§6.6).

-- ---------------------------------------------------------------------------
-- categories — taxonomy, bilingual labels (§2.1)
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name_en text not null,
  name_ar text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;

-- Beachhead categories (design/content first, §4.1). Idempotent re-seed.
insert into public.categories (slug, name_en, name_ar, sort_order) values
  ('graphic-design',    'Graphic Design',    'تصميم جرافيك',     10),
  ('content-writing',   'Content Writing',   'كتابة المحتوى',     20),
  ('translation',       'Translation',       'الترجمة',           30),
  ('web-development',    'Web Development',   'تطوير الويب',       40),
  ('mobile-development', 'Mobile Development','تطوير التطبيقات',   50),
  ('video-editing',     'Video & Animation', 'فيديو وأنيميشن',    60),
  ('digital-marketing', 'Digital Marketing', 'التسويق الرقمي',    70),
  ('voice-over',        'Voice Over',        'التعليق الصوتي',    80)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- gigs — freelancer service listings. Canonical price in USD minor units (§6).
-- ---------------------------------------------------------------------------
create table if not exists public.gigs (
  id uuid primary key default gen_random_uuid(),
  freelancer_id uuid not null references public.profiles (id) on delete cascade,
  category_id uuid not null references public.categories (id),
  title text not null,
  slug text unique not null,
  description text not null,
  price_usd_minor int not null check (price_usd_minor >= 0),
  delivery_days int not null check (delivery_days > 0),
  status text not null default 'active'
    check (status in ('draft', 'active', 'paused', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_gigs_category on public.gigs (category_id);
create index if not exists idx_gigs_freelancer on public.gigs (freelancer_id);
create index if not exists idx_gigs_status_created on public.gigs (status, created_at desc);

drop trigger if exists trg_gigs_updated_at on public.gigs;
create trigger trg_gigs_updated_at
  before update on public.gigs
  for each row execute function public.set_updated_at();

alter table public.gigs enable row level security;
