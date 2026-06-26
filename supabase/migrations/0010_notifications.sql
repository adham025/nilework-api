-- 0010_notifications — In-app notification inventory (slice #10, §6.7).
-- Typed events (type + data), not pre-rendered text, so the bilingual web renders
-- each via i18n in the reader's locale (§2.1). Owner-readable so the unread bell
-- can use a direct RLS read / Realtime; writes go through the API (service-role).
-- Email (Resend) is a thin later layer on top of the same notify() emit point.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user on public.notifications (user_id, created_at desc);
create index if not exists idx_notifications_unread
  on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select using (auth.uid() = user_id);

-- Live unread bell (same defensive pattern as messages).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
exception
  when duplicate_object then null;
end $$;
