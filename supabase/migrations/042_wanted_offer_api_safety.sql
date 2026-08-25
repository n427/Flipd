-- Forward-only hardening for Wanted offer API mutations. All mutators take
-- the same deterministic profile locks before checking blocks. A new row in
-- public.blocks must acquire KEY SHARE locks on its two profile foreign-key
-- targets, which conflict with FOR UPDATE. Therefore block creation either
-- commits before the recheck (and is rejected) or waits until this operation
-- commits (and is ordered after it); there is no check/insert TOCTOU window.

create or replace function public.lock_wanted_offer_participants(first_user_id uuid, second_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  locked_profile_id uuid;
  earlier_user_id uuid;
  later_user_id uuid;
begin
  if first_user_id is null or second_user_id is null or first_user_id = second_user_id then
    raise exception 'wanted offer participants are invalid' using errcode = '42501';
  end if;

  if first_user_id < second_user_id then
    earlier_user_id := first_user_id;
    later_user_id := second_user_id;
  else
    earlier_user_id := second_user_id;
    later_user_id := first_user_id;
  end if;

  select id into locked_profile_id from public.profiles where id = earlier_user_id for update;
  if not found then raise exception 'wanted offer participant not found' using errcode = 'P0002'; end if;
  select id into locked_profile_id from public.profiles where id = later_user_id for update;
  if not found then raise exception 'wanted offer participant not found' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.submit_wanted_offer(
  target_post_id uuid,
  actor_id uuid,
  client_offer_id uuid,
  offered_price integer,
  offered_description text,
  offered_message text,
  offered_photo_paths text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  locked_post public.wanted_posts%rowtype;
  locked_offer public.wanted_offers%rowtype;
  saved_offer_id uuid;
begin
  select * into locked_post from public.wanted_posts where id = target_post_id for update;
  if not found then raise exception 'wanted post not found' using errcode = 'P0002'; end if;

  if actor_id is null or actor_id = locked_post.buyer_id then
    raise exception 'only another user may offer on this wanted post' using errcode = '42501';
  end if;

  perform public.lock_wanted_offer_participants(locked_post.buyer_id, actor_id);
  if exists (
    select 1 from public.blocks
    where (blocker_id = locked_post.buyer_id and blocked_id = actor_id)
       or (blocker_id = actor_id and blocked_id = locked_post.buyer_id)
  ) then
    raise exception 'wanted offer participants are blocked' using errcode = '42501';
  end if;

  if locked_post.status <> 'active' or locked_post.needed_by <= clock_timestamp() then
    raise exception 'wanted post is no longer active' using errcode = 'P0001';
  end if;

  if client_offer_id is null
     or offered_photo_paths is null
     or cardinality(offered_photo_paths) not between 1 and 6
     or exists (
       select 1
       from unnest(offered_photo_paths) as paths(path)
       where paths.path !~ ('^' || actor_id::text || '/' || client_offer_id::text || '/[^/]+(?:/[^/]+)*$')
     ) then
    raise exception 'wanted offer photo paths are invalid' using errcode = '23514';
  end if;

  select * into locked_offer
  from public.wanted_offers
  where wanted_post_id = locked_post.id and seller_id = actor_id
  for update;

  if found then
    if locked_offer.id <> client_offer_id then
      raise exception 'resubmission must reuse the existing offer ID' using errcode = 'P0001';
    end if;
    if locked_offer.status <> 'withdrawn' then
      raise exception 'only withdrawn offers may be resubmitted' using errcode = 'P0001';
    end if;

    update public.wanted_offers
       set price = offered_price,
           description = offered_description,
           message = offered_message,
           photo_paths = offered_photo_paths,
           status = 'pending',
           resolved_at = null
     where id = locked_offer.id
     returning id into saved_offer_id;
  else
    insert into public.wanted_offers (
      id, wanted_post_id, seller_id, buyer_id, price, description, message, photo_paths
    ) values (
      client_offer_id, locked_post.id, actor_id, locked_post.buyer_id,
      offered_price, offered_description, offered_message, offered_photo_paths
    ) returning id into saved_offer_id;
  end if;

  return saved_offer_id;
end;
$$;

create or replace function public.mutate_wanted_offer(
  target_offer_id uuid,
  actor_id uuid,
  mutation text,
  offered_price integer default null,
  offered_description text default null,
  offered_message text default null,
  offered_photo_paths text[] default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  locked_post public.wanted_posts%rowtype;
  locked_offer public.wanted_offers%rowtype;
begin
  -- Parent first prevents races with acceptance, deletion, expiry handling,
  -- and other offer mutations for the same post.
  select post.* into locked_post
  from public.wanted_posts as post
  join public.wanted_offers as offer on offer.wanted_post_id = post.id
  where offer.id = target_offer_id
  for update of post;
  if not found then raise exception 'wanted offer not found' using errcode = 'P0002'; end if;

  select * into locked_offer from public.wanted_offers where id = target_offer_id for update;
  if not found or locked_offer.wanted_post_id <> locked_post.id then
    raise exception 'wanted offer not found' using errcode = 'P0002';
  end if;
  if actor_id is null or (actor_id <> locked_offer.buyer_id and actor_id <> locked_offer.seller_id) then
    raise exception 'only wanted offer participants may mutate it' using errcode = '42501';
  end if;
  if locked_offer.buyer_id <> locked_post.buyer_id then
    raise exception 'wanted offer participants are invalid' using errcode = 'P0001';
  end if;

  perform public.lock_wanted_offer_participants(locked_offer.buyer_id, locked_offer.seller_id);
  if exists (
    select 1 from public.blocks
    where (blocker_id = locked_offer.buyer_id and blocked_id = locked_offer.seller_id)
       or (blocker_id = locked_offer.seller_id and blocked_id = locked_offer.buyer_id)
  ) then
    raise exception 'wanted offer participants are blocked' using errcode = '42501';
  end if;
  if locked_post.status <> 'active' or locked_post.needed_by <= clock_timestamp() then
    raise exception 'wanted post is no longer active' using errcode = 'P0001';
  end if;
  if locked_offer.status <> 'pending' then
    raise exception 'wanted offer is no longer pending' using errcode = 'P0001';
  end if;

  if mutation = 'edit' then
    if actor_id <> locked_offer.seller_id then
      raise exception 'only the offer seller may edit it' using errcode = '42501';
    end if;
    if offered_photo_paths is null
       or cardinality(offered_photo_paths) not between 1 and 6
       or exists (
         select 1
         from unnest(offered_photo_paths) as paths(path)
         where paths.path !~ ('^' || locked_offer.seller_id::text || '/' || locked_offer.id::text || '/[^/]+(?:/[^/]+)*$')
       ) then
      raise exception 'wanted offer photo paths are invalid' using errcode = '23514';
    end if;
    update public.wanted_offers
       set price = offered_price,
           description = offered_description,
           message = offered_message,
           photo_paths = offered_photo_paths
     where id = locked_offer.id;
  elsif mutation = 'decline' then
    if actor_id <> locked_offer.buyer_id then
      raise exception 'only the wanted post buyer may decline it' using errcode = '42501';
    end if;
    update public.wanted_offers
       set status = 'declined', resolved_at = clock_timestamp()
     where id = locked_offer.id;
  elsif mutation = 'withdraw' then
    if actor_id <> locked_offer.seller_id then
      raise exception 'only the offer seller may withdraw it' using errcode = '42501';
    end if;
    update public.wanted_offers
       set status = 'withdrawn', resolved_at = clock_timestamp()
     where id = locked_offer.id;
  else
    raise exception 'invalid wanted offer mutation' using errcode = 'P0001';
  end if;

  return locked_offer.id;
end;
$$;

-- Replaces 040's implementation so acceptance shares the profile-lock and
-- block-check serialization point with submit/reactivation and mutations.
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
  select post.* into locked_post
  from public.wanted_posts as post
  join public.wanted_offers as offer on offer.wanted_post_id = post.id
  where offer.id = target_offer_id
  for update of post;
  if not found then raise exception 'wanted offer not found' using errcode = 'P0002'; end if;

  select * into locked_offer from public.wanted_offers where id = target_offer_id for update;
  if not found or locked_offer.wanted_post_id <> locked_post.id then
    raise exception 'wanted offer not found' using errcode = 'P0002';
  end if;
  if actor_id is null
     or actor_id <> locked_offer.buyer_id
     or actor_id <> locked_post.buyer_id then
    raise exception 'only the wanted post buyer can accept an offer' using errcode = '42501';
  end if;

  perform public.lock_wanted_offer_participants(locked_offer.buyer_id, locked_offer.seller_id);
  if exists (
    select 1 from public.blocks
    where (blocker_id = locked_offer.buyer_id and blocked_id = locked_offer.seller_id)
       or (blocker_id = locked_offer.seller_id and blocked_id = locked_offer.buyer_id)
  ) then
    raise exception 'wanted offer participants are blocked' using errcode = '42501';
  end if;

  if locked_offer.status = 'accepted' and locked_post.status = 'fulfilled' then
    insert into public.message_threads (wanted_offer_id, listing_id, listing_title, buyer_id, seller_id)
    values (locked_offer.id, null, locked_post.title, locked_offer.buyer_id, locked_offer.seller_id)
    on conflict (wanted_offer_id) do update set wanted_offer_id = excluded.wanted_offer_id
    returning id into thread_id;
    return thread_id;
  end if;
  if locked_post.status <> 'active' or locked_post.needed_by <= clock_timestamp() then
    raise exception 'wanted post is no longer active' using errcode = 'P0001';
  end if;
  if locked_offer.status <> 'pending' then
    raise exception 'wanted offer is no longer pending' using errcode = 'P0001';
  end if;

  update public.wanted_offers set status = 'accepted', resolved_at = clock_timestamp() where id = locked_offer.id;
  update public.wanted_offers
     set status = 'declined', resolved_at = clock_timestamp()
   where wanted_post_id = locked_post.id and id <> locked_offer.id and status = 'pending';
  update public.wanted_posts set status = 'fulfilled', resolved_at = clock_timestamp() where id = locked_post.id;

  insert into public.message_threads (wanted_offer_id, listing_id, listing_title, buyer_id, seller_id)
  values (locked_offer.id, null, locked_post.title, locked_offer.buyer_id, locked_offer.seller_id)
  on conflict (wanted_offer_id) do update set wanted_offer_id = excluded.wanted_offer_id
  returning id into thread_id;
  return thread_id;
end;
$$;

revoke all on function public.lock_wanted_offer_participants(uuid, uuid) from public, anon, authenticated;
revoke all on function public.submit_wanted_offer(uuid, uuid, uuid, integer, text, text, text[]) from public, anon, authenticated;
revoke all on function public.mutate_wanted_offer(uuid, uuid, text, integer, text, text, text[]) from public, anon, authenticated;
revoke all on function public.accept_wanted_offer(uuid, uuid) from public, anon, authenticated;
grant execute on function public.submit_wanted_offer(uuid, uuid, uuid, integer, text, text, text[]) to service_role;
grant execute on function public.mutate_wanted_offer(uuid, uuid, text, integer, text, text, text[]) to service_role;
grant execute on function public.accept_wanted_offer(uuid, uuid) to service_role;
