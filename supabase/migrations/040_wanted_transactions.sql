-- A transaction can originate from the original sale flow or from an accepted
-- wanted offer, but never both. Existing sale rows keep their request source.
alter table public.message_threads alter column request_id drop not null;
alter table public.message_threads
  add column wanted_offer_id uuid unique references public.wanted_offers(id) on delete cascade;
alter table public.message_threads
  add constraint message_threads_one_source
  check (num_nonnulls(request_id, wanted_offer_id) = 1);

alter table public.ratings alter column request_id drop not null;
alter table public.ratings
  add column wanted_offer_id uuid references public.wanted_offers(id) on delete cascade;
alter table public.ratings
  add constraint ratings_one_source
  check (num_nonnulls(request_id, wanted_offer_id) = 1);
create unique index ratings_wanted_once
  on public.ratings(wanted_offer_id, rater_id)
  where wanted_offer_id is not null;

alter table public.reports
  add column target_wanted_post_id uuid references public.wanted_posts(id) on delete set null;
alter table public.reports
  add column target_wanted_offer_id uuid references public.wanted_offers(id) on delete set null;
alter table public.reports drop constraint reports_at_most_one_target;
alter table public.reports
  add constraint reports_at_most_one_target check (
    num_nonnulls(
      target_listing_id,
      target_user_id,
      target_thread_id,
      target_wanted_post_id,
      target_wanted_offer_id
    ) <= 1
  );

-- A pending offer is only meaningful while its parent post is still live.
-- This acquires the same parent-post lock as acceptance, so an offer insert or
-- reactivation that races acceptance waits, then observes the fulfilled post
-- and fails rather than committing a new pending competitor.
create or replace function public.validate_pending_wanted_offer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  locked_post public.wanted_posts%rowtype;
begin
  select *
    into locked_post
    from public.wanted_posts
   where id = new.wanted_post_id
   for update;

  if not found then
    raise exception 'wanted post not found' using errcode = '23514';
  end if;

  if locked_post.status <> 'active'
     or locked_post.needed_by <= clock_timestamp()
     or new.buyer_id <> locked_post.buyer_id
     or new.seller_id = new.buyer_id then
    raise exception 'pending offer requires an active, unexpired wanted post and valid participants'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger wanted_offers_guard_pending_insert
  before insert on public.wanted_offers
  for each row
  when (new.status = 'pending')
  execute function public.validate_pending_wanted_offer();

create trigger wanted_offers_guard_pending_update
  before update of status, wanted_post_id, buyer_id, seller_id on public.wanted_offers
  for each row
  when (
    new.status = 'pending'
    and (
      old.status is distinct from new.status
      or old.wanted_post_id is distinct from new.wanted_post_id
      or old.buyer_id is distinct from new.buyer_id
      or old.seller_id is distinct from new.seller_id
    )
  )
  execute function public.validate_pending_wanted_offer();

revoke all on function public.validate_pending_wanted_offer() from public, anon, authenticated;

-- Acceptance serializes on the post first. That lets the winner decline all
-- competing offers without deadlocking with a concurrent acceptance targeting
-- a different offer on the same post.
create or replace function public.accept_wanted_offer(target_offer_id uuid, actor_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  locked_post public.wanted_posts%rowtype;
  locked_offer public.wanted_offers%rowtype;
  thread_id uuid;
begin
  select post.*
    into locked_post
    from public.wanted_posts as post
    join public.wanted_offers as offer on offer.wanted_post_id = post.id
   where offer.id = target_offer_id
   for update of post;

  if not found then
    raise exception 'wanted offer not found' using errcode = 'P0002';
  end if;

  select *
    into locked_offer
    from public.wanted_offers
   where id = target_offer_id
   for update;

  if not found then
    raise exception 'wanted offer not found' using errcode = 'P0002';
  end if;

  if locked_offer.wanted_post_id <> locked_post.id then
    raise exception 'wanted offer post changed during acceptance' using errcode = '40001';
  end if;

  if actor_id is null
     or actor_id <> locked_offer.buyer_id
     or actor_id <> locked_post.buyer_id then
    raise exception 'only the wanted post buyer can accept an offer' using errcode = '42501';
  end if;

  -- A retry for the selected winner returns the original thread. The unique
  -- wanted_offer_id constraint is the final guard against duplicated threads.
  if locked_offer.status = 'accepted' and locked_post.status = 'fulfilled' then
    insert into public.message_threads (
      wanted_offer_id,
      listing_id,
      listing_title,
      buyer_id,
      seller_id
    ) values (
      locked_offer.id,
      null,
      locked_post.title,
      locked_offer.buyer_id,
      locked_offer.seller_id
    )
    on conflict (wanted_offer_id) do update
      set wanted_offer_id = excluded.wanted_offer_id
    returning id into thread_id;

    return thread_id;
  end if;

  if locked_post.status <> 'active' then
    raise exception 'wanted post is no longer active' using errcode = 'P0001';
  end if;

  if locked_post.needed_by <= clock_timestamp() then
    raise exception 'wanted post deadline has passed' using errcode = 'P0001';
  end if;

  if locked_offer.status <> 'pending' then
    raise exception 'wanted offer is no longer pending' using errcode = 'P0001';
  end if;

  update public.wanted_offers
     set status = 'accepted',
         resolved_at = clock_timestamp()
   where id = locked_offer.id;

  update public.wanted_offers
     set status = 'declined',
         resolved_at = clock_timestamp()
   where wanted_post_id = locked_post.id
     and id <> locked_offer.id
     and status = 'pending';

  update public.wanted_posts
     set status = 'fulfilled',
         resolved_at = clock_timestamp()
   where id = locked_post.id;

  insert into public.message_threads (
    wanted_offer_id,
    listing_id,
    listing_title,
    buyer_id,
    seller_id
  ) values (
    locked_offer.id,
    null,
    locked_post.title,
    locked_offer.buyer_id,
    locked_offer.seller_id
  )
  on conflict (wanted_offer_id) do update
    set wanted_offer_id = excluded.wanted_offer_id
  returning id into thread_id;

  return thread_id;
end;
$$;

revoke all on function public.accept_wanted_offer(uuid, uuid) from public, anon, authenticated;
grant execute on function public.accept_wanted_offer(uuid, uuid) to service_role;
