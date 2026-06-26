-- 0009_reviews — Two-sided reviews on completed orders (slice #9, §7).
-- After an order is released, each party may review the other once. Reviews are
-- the public trust graph (§3) and the rating input the freelancer Pro Path will
-- consume (§5.3). Served via the API (service-role) like gigs/orders; RLS stays
-- deny-by-default so the API is the single gatekeeper for visibility rules.

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  reviewer_id uuid not null references public.profiles (id),
  reviewee_id uuid not null references public.profiles (id),
  reviewer_role text not null check (reviewer_role in ('client', 'freelancer')),
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  -- One review per reviewer per order.
  unique (order_id, reviewer_id),
  check (reviewer_id <> reviewee_id)
);

create index if not exists idx_reviews_reviewee on public.reviews (reviewee_id, created_at desc);
create index if not exists idx_reviews_order on public.reviews (order_id);

alter table public.reviews enable row level security;
