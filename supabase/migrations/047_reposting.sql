-- Preserve original creation timestamps while allowing owners to return an
-- active listing/request to the top of recency feeds once every seven days.

alter table public.listings
  add column reposted_at timestamptz,
  add column feed_at timestamptz generated always as (coalesce(reposted_at, created_at)) stored;

alter table public.wanted_posts
  add column reposted_at timestamptz,
  add column feed_at timestamptz generated always as (coalesce(reposted_at, created_at)) stored;

create index listings_repost_feed_idx
  on public.listings (feed_at desc, id desc)
  where archived = false;

create index wanted_posts_repost_feed_idx
  on public.wanted_posts (feed_at desc, id desc)
  where status = 'active';

create or replace function public.guard_reposted_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('postgres', 'service_role') and (
    (tg_op = 'INSERT' and new.reposted_at is not null)
    or (tg_op = 'UPDATE' and new.reposted_at is distinct from old.reposted_at)
  ) then
    raise exception using errcode = '42501', message = 'repost timestamp is server managed';
  end if;
  return new;
end;
$$;

create trigger listings_guard_reposted_at
before insert or update on public.listings
for each row execute function public.guard_reposted_at();

create trigger wanted_posts_guard_reposted_at
before insert or update on public.wanted_posts
for each row execute function public.guard_reposted_at();

create or replace function public.repost_listing(p_listing_id uuid, p_user_id uuid)
returns table (reposted_at timestamptz, feed_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_owner uuid;
  v_archived boolean;
  v_feed_at timestamptz;
begin
  update public.listings as target
     set reposted_at = v_now
   where target.id = p_listing_id
     and target.seller_id = p_user_id
     and target.archived = false
     and target.feed_at <= v_now - interval '7 days'
  returning target.reposted_at, target.feed_at
       into reposted_at, feed_at;

  if found then return next; return; end if;

  select seller_id, archived, listings.feed_at
    into v_owner, v_archived, v_feed_at
    from public.listings
   where id = p_listing_id;
  if not found or v_owner <> p_user_id then
    raise exception using errcode = 'P0002', message = 'post not found';
  end if;
  if v_archived then
    raise exception using errcode = '23514', message = 'post is closed';
  end if;
  raise exception using errcode = 'P0001', message = 'repost cooldown active',
    detail = (v_feed_at + interval '7 days')::text;
end;
$$;

create or replace function public.repost_wanted_post(p_post_id uuid, p_user_id uuid)
returns table (reposted_at timestamptz, feed_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_owner uuid;
  v_status text;
  v_needed_by timestamptz;
  v_feed_at timestamptz;
begin
  update public.wanted_posts as target
     set reposted_at = v_now
   where target.id = p_post_id
     and target.buyer_id = p_user_id
     and target.status = 'active'
     and target.needed_by > v_now
     and target.feed_at <= v_now - interval '7 days'
  returning target.reposted_at, target.feed_at
       into reposted_at, feed_at;

  if found then return next; return; end if;

  select buyer_id, status, needed_by, wanted_posts.feed_at
    into v_owner, v_status, v_needed_by, v_feed_at
    from public.wanted_posts
   where id = p_post_id;
  if not found or v_owner <> p_user_id then
    raise exception using errcode = 'P0002', message = 'post not found';
  end if;
  if v_status <> 'active' or v_needed_by <= v_now then
    raise exception using errcode = '23514', message = 'post is closed';
  end if;
  raise exception using errcode = 'P0001', message = 'repost cooldown active',
    detail = (v_feed_at + interval '7 days')::text;
end;
$$;

revoke all on function public.repost_listing(uuid, uuid) from public, anon, authenticated;
revoke all on function public.repost_wanted_post(uuid, uuid) from public, anon, authenticated;
grant execute on function public.repost_listing(uuid, uuid) to service_role;
grant execute on function public.repost_wanted_post(uuid, uuid) to service_role;
