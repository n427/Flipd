-- Persisted, user-scoped Wanted notifications and atomic lifecycle claims.

alter table public.wanted_posts
  add column reminder_sent_at timestamptz;

create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null check (char_length(event_key) between 1 and 240),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in ('new-offer','accepted','declined','edit','reminder','expired')),
  wanted_post_id uuid not null references public.wanted_posts(id) on delete cascade,
  wanted_offer_id uuid references public.wanted_offers(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 160),
  body text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  dismissed_at timestamptz,
  unique (event_key, user_id)
);

create index notification_events_user_recency_idx
  on public.notification_events(user_id, created_at desc)
  where dismissed_at is null;
create index wanted_posts_due_idx
  on public.wanted_posts(needed_by)
  where status = 'active';

alter table public.notification_events enable row level security;
grant select on public.notification_events to authenticated;
grant update (read_at, dismissed_at) on public.notification_events to authenticated;

create policy "notification_events_select_own" on public.notification_events
  for select to authenticated using (user_id = auth.uid());
create policy "notification_events_update_own" on public.notification_events
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Offer notifications are a transactional outbox: every successful offer
-- write commits its durable event in the same transaction. This sees the exact
-- rows changed while holding the parent lock, including competitors closed by
-- acceptance and offers closed by post deletion.
create or replace function public.persist_wanted_offer_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_title text;
  next_key text;
  next_type text;
  recipient_id uuid;
  event_title text;
  event_body text;
begin
  select title into post_title from public.wanted_posts where id = new.wanted_post_id;

  if tg_op = 'INSERT' and new.status = 'pending' then
    next_key := 'wanted:new-offer:' || new.id::text;
    next_type := 'new-offer';
    recipient_id := new.buyer_id;
    event_title := 'New offer received';
    event_body := 'You received a new offer for “' || post_title || '”.';
  elsif tg_op = 'INSERT' then
    return new;
  elsif old.status = 'withdrawn' and new.status = 'pending' then
    next_key := 'wanted:new-offer:' || new.id::text;
    next_type := 'new-offer';
    recipient_id := new.buyer_id;
    event_title := 'New offer received';
    event_body := 'You received a new offer for “' || post_title || '”.';
  elsif old.status = 'pending' and new.status = 'accepted' then
    next_key := 'wanted:accepted:' || new.id::text;
    next_type := 'accepted';
    recipient_id := new.seller_id;
    event_title := 'Offer accepted';
    event_body := 'Your offer for “' || post_title || '” was accepted. Your chat is ready.';
  elsif old.status = 'pending' and new.status = 'declined' then
    next_key := 'wanted:declined:' || new.id::text;
    next_type := 'declined';
    recipient_id := new.seller_id;
    event_title := 'Offer closed';
    event_body := 'Your offer for “' || post_title || '” was closed.';
  elsif old.status = 'pending' and new.status = 'expired' then
    next_key := 'wanted:expired:' || new.wanted_post_id::text;
    next_type := 'expired';
    recipient_id := new.seller_id;
    event_title := 'Wanted request expired';
    event_body := '“' || post_title || '” expired, so your offer was closed.';
  else
    return new;
  end if;

  insert into public.notification_events (
    event_key, user_id, event_type, wanted_post_id, wanted_offer_id, title, body
  ) values (
    next_key, recipient_id, next_type, new.wanted_post_id, new.id, event_title, event_body
  ) on conflict (event_key, user_id) do nothing;
  return new;
end;
$$;

create trigger wanted_offer_notification_events
  after insert or update of status on public.wanted_offers
  for each row execute function public.persist_wanted_offer_notification();

-- Only changes that can affect a seller's decision produce an edit event.
-- Title/category/reference-photo changes are deliberately cosmetic here.
create or replace function public.persist_wanted_material_edit_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- MATERIAL_EDIT_GUARD_START
  if old.status = 'active' and new.status = 'active' and (
    old.max_budget is distinct from new.max_budget
    or old.description is distinct from new.description
    or old.location is distinct from new.location
    or old.needed_by is distinct from new.needed_by
  ) then
  -- MATERIAL_EDIT_GUARD_END
    insert into public.notification_events (
      event_key, user_id, event_type, wanted_post_id, wanted_offer_id, title, body
    )
    select
      'wanted:edit:' || new.id::text || ':' || new.updated_at::text,
      offer.seller_id,
      'edit',
      new.id,
      offer.id,
      'Wanted request updated',
      '“' || new.title || '” was updated. Review it before your offer closes.'
    from public.wanted_offers as offer
    where offer.wanted_post_id = new.id and offer.status = 'pending'
    on conflict (event_key, user_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger wanted_post_material_edit_notification_events
  after update on public.wanted_posts
  for each row execute function public.persist_wanted_material_edit_notifications();

-- Claiming and persisting happen in one transaction. If event insertion fails,
-- reminder_sent_at remains null and the next sweep can retry safely.
create or replace function public.claim_wanted_reminder(
  target_post_id uuid,
  expected_buyer_id uuid,
  event_key_value text,
  event_title text,
  event_body text,
  claimed_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  locked_post public.wanted_posts%rowtype;
begin
  select * into locked_post
    from public.wanted_posts
   where id = target_post_id
   for update;
  if not found
     or locked_post.buyer_id <> expected_buyer_id
     or locked_post.status <> 'active'
     or locked_post.reminder_sent_at is not null
     or locked_post.needed_by <= claimed_at
     or locked_post.needed_by > claimed_at + interval '24 hours' then
    return false;
  end if;

  insert into public.notification_events (
    event_key, user_id, event_type, wanted_post_id, title, body
  ) values (
    event_key_value, locked_post.buyer_id, 'reminder', locked_post.id, event_title, event_body
  ) on conflict (event_key, user_id) do nothing;

  update public.wanted_posts
     set reminder_sent_at = claimed_at
   where id = locked_post.id;
  return true;
end;
$$;

-- A parent row lock serializes expiry with offer acceptance/mutation. Closing
-- pending offers and inserting seller events is a single commit.
create or replace function public.expire_wanted_post(
  target_post_id uuid,
  expired_at timestamptz
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  locked_post public.wanted_posts%rowtype;
  affected_sellers uuid[];
begin
  select * into locked_post
    from public.wanted_posts
   where id = target_post_id
   for update;
  if not found or locked_post.status <> 'active' or locked_post.needed_by > expired_at then
    return null;
  end if;

  select coalesce(array_agg(seller_id), '{}'::uuid[])
    into affected_sellers
    from public.wanted_offers
   where wanted_post_id = locked_post.id and status = 'pending';

  update public.wanted_offers
     set status = 'expired', resolved_at = expired_at
   where wanted_post_id = locked_post.id and status = 'pending';
  update public.wanted_posts
     set status = 'expired', resolved_at = expired_at
   where id = locked_post.id;

  return affected_sellers;
end;
$$;

revoke all on function public.claim_wanted_reminder(uuid, uuid, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.persist_wanted_offer_notification() from public, anon, authenticated;
revoke all on function public.persist_wanted_material_edit_notifications() from public, anon, authenticated;
revoke all on function public.expire_wanted_post(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_wanted_reminder(uuid, uuid, text, text, text, timestamptz) to service_role;
grant execute on function public.expire_wanted_post(uuid, timestamptz) to service_role;
