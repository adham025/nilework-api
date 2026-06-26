-- 0007_conversations_messages — Pre-sale + in-order messaging (slice #7, §5).
-- A conversation links a client and a freelancer (optionally about a gig). Unlike
-- the gig/order tables, messaging is the case the architecture (§6.1) explicitly
-- allows DIRECT, RLS-scoped client reads + Supabase Realtime: participants get a
-- SELECT policy so the web can subscribe to live message inserts. Writes still go
-- through the API (service-role).

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id),
  freelancer_id uuid not null references public.profiles (id),
  gig_id uuid references public.gigs (id),
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (client_id <> freelancer_id)
);

create index if not exists idx_conversations_client on public.conversations (client_id, last_message_at desc);
create index if not exists idx_conversations_freelancer on public.conversations (freelancer_id, last_message_at desc);
-- One thread per (client, freelancer, gig). NULL gig_id allows a general thread too.
create unique index if not exists uq_conversations_triple
  on public.conversations (client_id, freelancer_id, coalesce(gig_id, '00000000-0000-0000-0000-000000000000'::uuid));

drop trigger if exists trg_conversations_updated_at on public.conversations;
create trigger trg_conversations_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

alter table public.conversations enable row level security;

drop policy if exists conversations_select_participant on public.conversations;
create policy conversations_select_participant on public.conversations
  for select using (auth.uid() = client_id or auth.uid() = freelancer_id);

-- ---------------------------------------------------------------------------
-- messages — one per sent message. Participant-readable so Realtime works.
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id),
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_conversation on public.messages (conversation_id, created_at);

alter table public.messages enable row level security;

drop policy if exists messages_select_participant on public.messages;
create policy messages_select_participant on public.messages
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (auth.uid() = c.client_id or auth.uid() = c.freelancer_id)
    )
  );

-- Enable Supabase Realtime for messages (live thread updates). Defensive: only if
-- the publication exists (it does on Supabase), and ignore if already added.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
exception
  when duplicate_object then null;
end $$;
