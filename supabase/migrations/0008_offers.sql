-- 0008_offers — Custom offers inside a conversation (slice #8, §5.1).
-- A freelancer sends a structured price/scope/deadline quote in a thread; the
-- client accepts it into an order via the SAME orders flow (orders.gig_id is
-- nullable for exactly this). Distinct from a gig purchase: an offer is negotiated
-- 1:1. Participant-readable; writes via the API (service-role).

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  freelancer_id uuid not null references public.profiles (id),
  client_id uuid not null references public.profiles (id),
  gig_id uuid references public.gigs (id),
  title text not null,
  description text not null,
  price_usd_minor bigint not null check (price_usd_minor >= 500),
  delivery_days int not null check (delivery_days > 0),
  status text not null default 'pending' check (status in (
    'pending', 'accepted', 'declined', 'withdrawn', 'expired'
  )),
  order_id uuid references public.orders (id),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (client_id <> freelancer_id)
);

create index if not exists idx_offers_conversation on public.offers (conversation_id, created_at desc);

drop trigger if exists trg_offers_updated_at on public.offers;
create trigger trg_offers_updated_at
  before update on public.offers
  for each row execute function public.set_updated_at();

alter table public.offers enable row level security;

drop policy if exists offers_select_participant on public.offers;
create policy offers_select_participant on public.offers
  for select using (auth.uid() = client_id or auth.uid() = freelancer_id);
