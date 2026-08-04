-- In-app messaging. Approving a reveal request now opens a thread inside Flipd
-- instead of swapping contact details between users.
--
-- The 72h approve gate is unchanged: only the payoff changes. reveal_requests
-- stays the request record; message_threads hangs off it once approved.

-- ── Buyer's intro message + optional seller decline reason ───────────
-- The intro message is what the seller approves on: a name and class year does
-- not say whether this person actually wants the item. Filtered for contact
-- details before insert (see containsContactInfo in src/lib/validation.ts) so
-- buyers cannot paste a phone number and route around the approval gate.
alter table public.reveal_requests
  add column if not exists intro_message text
    check (intro_message is null or length(intro_message) <= 600),
  add column if not exists decline_reason text
    check (decline_reason is null
           or decline_reason in ('bad_timing', 'already_sold', 'not_enough_info'));

-- ── Threads ──────────────────────────────────────────────────────────
-- One thread per approved request. request_id is unique, so a double-approve
-- cannot fork a second thread for the same request.
--
-- listing_id is nullable with on delete set null: a thread outlives its post.
-- listing_title is denormalized for the same reason reveal_requests carries one
-- (008_requests_survive_delete.sql) — the header stays readable after the
-- listing is gone.
create table if not exists public.message_threads (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique
    references public.reveal_requests (id) on delete cascade,
  listing_id uuid references public.listings (id) on delete set null,
  listing_title text,
  buyer_id uuid not null references public.profiles (id),
  seller_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  -- Mirrors the newest message so the thread list sorts without a join.
  last_message_at timestamptz,
  buyer_seen_at timestamptz,
  seller_seen_at timestamptz,
  constraint message_threads_distinct_parties check (buyer_id <> seller_id)
);

-- ── Messages ─────────────────────────────────────────────────────────
-- body defaults to '' because a message may be a pure attachment. The rule
-- "must have a body or an attachment" is NOT expressible as a check constraint
-- (Postgres forbids subqueries there), so the API route enforces it — it is the
-- only writer. Covered by tests rather than by the database.
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.message_threads (id) on delete cascade,
  sender_id uuid not null references public.profiles (id),
  body text not null default '' check (length(body) <= 2000),
  created_at timestamptz not null default now()
);

-- ── Attachments ──────────────────────────────────────────────────────
-- storage_path is an object path in the PRIVATE message-attachments bucket,
-- never a URL. Clients receive short-lived signed URLs minted per request,
-- after the API confirms the caller is a participant in the thread. Storing a
-- public URL here would make every private conversation readable by link.
create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  storage_path text not null,
  kind text not null check (kind in ('image', 'video')),
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  -- Intrinsic dimensions, so the client can reserve space before the signed
  -- URL loads and avoid a layout jump.
  width integer,
  height integer,
  duration_seconds numeric check (duration_seconds is null or duration_seconds > 0),
  created_at timestamptz not null default now()
);

create index if not exists messages_thread_idx
  on public.messages (thread_id, created_at desc);
create index if not exists attachments_message_idx
  on public.message_attachments (message_id);
create index if not exists threads_buyer_idx
  on public.message_threads (buyer_id, last_message_at desc nulls last);
create index if not exists threads_seller_idx
  on public.message_threads (seller_id, last_message_at desc nulls last);

-- ── RLS ──────────────────────────────────────────────────────────────
-- Matches 019_rls_policies.sql: participants get READ access for direct-to-
-- Supabase mobile reads and realtime; all writes go through the server, which
-- uses the service role and bypasses these.
alter table public.message_threads enable row level security;
alter table public.messages enable row level security;
alter table public.message_attachments enable row level security;

create policy "threads_select_party" on public.message_threads
  for select to authenticated
  using (buyer_id = auth.uid() or seller_id = auth.uid());

-- Realtime delivers row changes through this policy, so a subscriber only ever
-- receives messages on threads they belong to.
create policy "messages_select_party" on public.messages
  for select to authenticated
  using (exists (
    select 1 from public.message_threads t
    where t.id = messages.thread_id
      and (t.buyer_id = auth.uid() or t.seller_id = auth.uid())
  ));

create policy "attachments_select_party" on public.message_attachments
  for select to authenticated
  using (exists (
    select 1
    from public.messages m
    join public.message_threads t on t.id = m.thread_id
    where m.id = message_attachments.message_id
      and (t.buyer_id = auth.uid() or t.seller_id = auth.uid())
  ));

-- Keep the thread list ordered by activity without a join or an app-side write.
create or replace function public.touch_thread_last_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- greatest(), not plain assignment: a message inserted out of order (a
  -- backfill, a seed, a retried write) must not drag the thread's activity
  -- timestamp backwards and mis-sort the thread list.
  update public.message_threads
     set last_message_at = greatest(coalesce(last_message_at, new.created_at), new.created_at)
   where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_thread on public.messages;
create trigger messages_touch_thread
  after insert on public.messages
  for each row execute function public.touch_thread_last_message();
