-- 034_listing_digest.sql
-- Captures what users search for, so the daily digest can tell the difference
-- between "listings we have" and "listings this person would want".

create table if not exists public.search_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  query text not null,
  created_at timestamptz not null default now()
);

-- The digest reads a 30-day window per user; this is the only access pattern.
create index if not exists search_events_user_recent_idx
  on public.search_events (user_id, created_at desc);

alter table public.search_events enable row level security;

-- Users may write their own search history and read it back. There is no
-- update or delete policy: search history is append-only, and the digest
-- producer reads it with the service role, which bypasses RLS entirely.
drop policy if exists search_events_insert_own on public.search_events;
create policy search_events_insert_own on public.search_events
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists search_events_select_own on public.search_events;
create policy search_events_select_own on public.search_events
  for select to authenticated
  using (auth.uid() = user_id);

-- Nullable and null for every existing user: a user who has never received a
-- digest is due for one as soon as they have signals, which is what we want.
alter table public.profiles
  add column if not exists last_digest_at timestamptz;

-- last_digest_at is written only by the service-role producer. It is
-- deliberately absent from the authenticated UPDATE grant in
-- 033_sms_consent.sql -- a user who could write it could suppress or replay
-- their own digest. Do not add it to that grant list.
