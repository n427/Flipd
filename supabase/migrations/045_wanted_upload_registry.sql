-- Durable upload ownership/state closes the gap between PostgreSQL attachment
-- and the non-transactional Storage API. cleanup_claimed is a tombstone: it is
-- never rolled back or made attachable after Storage removal succeeds/fails.
create table public.wanted_uploads (
  path text primary key,
  bucket text not null check (bucket in ('wanted-reference-photos','wanted-offer-photos')),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  public_url text,
  state text not null default 'uploaded' check (state in ('uploaded','attached','cleanup_claimed')),
  attached_kind text check (attached_kind in ('post','offer')),
  attached_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((state = 'attached') = (attached_kind is not null and attached_id is not null))
);
create unique index wanted_uploads_public_url_uniq on public.wanted_uploads(public_url) where public_url is not null;
create index wanted_uploads_attachment_idx on public.wanted_uploads(attached_kind, attached_id) where state = 'attached';
alter table public.wanted_uploads enable row level security;

-- Wanted has not been activated before this migration. Refuse to guess at
-- ownership if that rollout invariant is violated: legacy URLs may be shared,
-- so ON CONFLICT backfill would silently attach one row and strand another.
do $$ begin
  if exists(select 1 from public.wanted_posts) or exists(select 1 from public.wanted_offers) then
    raise exception 'wanted upload registry requires zero pre-activation wanted rows; reconcile explicitly before retrying migration';
  end if;
end $$;

create or replace function public.register_wanted_upload(
  upload_path text, upload_bucket text, actor_id uuid, upload_public_url text default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if actor_id is null or upload_path !~ ('^' || actor_id::text || '/.+')
     or upload_bucket not in ('wanted-reference-photos','wanted-offer-photos') then
    raise exception 'invalid wanted upload registration' using errcode = '23514';
  end if;
  insert into public.wanted_uploads(path,bucket,owner_id,public_url)
  values(upload_path,upload_bucket,actor_id,upload_public_url);
end $$;

create or replace function public.sync_wanted_offer_uploads(
  target_offer_id uuid, actor_id uuid, upload_paths text[]
) returns void language plpgsql security definer set search_path = '' as $$
declare invalid_count integer;
begin
  if upload_paths is null or cardinality(upload_paths) not between 1 and 6
     or cardinality(upload_paths) <> (select count(distinct requested.path) from unnest(upload_paths) requested(path)) then
    raise exception 'invalid wanted offer uploads' using errcode = '23514';
  end if;
  perform 1 from public.wanted_uploads
   where (attached_kind = 'offer' and attached_id = target_offer_id) or path = any(upload_paths)
   order by path for update;
  select count(*) into invalid_count from unnest(upload_paths) requested(path)
   left join public.wanted_uploads upload on upload.path = requested.path
   where upload.path is null or upload.owner_id <> actor_id or upload.bucket <> 'wanted-offer-photos'
      or upload.state = 'cleanup_claimed'
      or (upload.state = 'attached' and (upload.attached_kind <> 'offer' or upload.attached_id <> target_offer_id));
  if invalid_count > 0 then raise exception 'wanted upload unavailable' using errcode = 'P0001'; end if;
  update public.wanted_uploads set state='uploaded',attached_kind=null,attached_id=null,updated_at=now()
   where attached_kind='offer' and attached_id=target_offer_id and not(path=any(upload_paths));
  update public.wanted_uploads set state='attached',attached_kind='offer',attached_id=target_offer_id,updated_at=now()
   where path=any(upload_paths);
end $$;

create or replace function public.sync_wanted_post_uploads(
  target_post_id uuid, actor_id uuid, upload_urls text[]
) returns void language plpgsql security definer set search_path = '' as $$
declare invalid_count integer;
begin
  upload_urls := coalesce(upload_urls,'{}');
  if cardinality(upload_urls) > 6 or cardinality(upload_urls) <> (select count(distinct requested.url) from unnest(upload_urls) requested(url)) then
    raise exception 'invalid wanted reference uploads' using errcode = '23514';
  end if;
  perform 1 from public.wanted_uploads
   where (attached_kind='post' and attached_id=target_post_id) or public_url=any(upload_urls)
   order by path for update;
  select count(*) into invalid_count from unnest(upload_urls) requested(url)
   left join public.wanted_uploads upload on upload.public_url=requested.url
   where upload.path is null or upload.owner_id<>actor_id or upload.bucket<>'wanted-reference-photos'
      or upload.state='cleanup_claimed'
      or (upload.state='attached' and (upload.attached_kind<>'post' or upload.attached_id<>target_post_id));
  if invalid_count > 0 then raise exception 'wanted upload unavailable' using errcode = 'P0001'; end if;
  update public.wanted_uploads set state='uploaded',attached_kind=null,attached_id=null,updated_at=now()
   where attached_kind='post' and attached_id=target_post_id and not(public_url=any(upload_urls));
  update public.wanted_uploads set state='attached',attached_kind='post',attached_id=target_post_id,updated_at=now()
   where public_url=any(upload_urls);
end $$;

create or replace function public.claim_wanted_upload_cleanup(
  upload_paths text[], target_bucket text, actor_id uuid
) returns text[] language plpgsql security definer set search_path = '' as $$
declare invalid_count integer;
begin
  if upload_paths is null or cardinality(upload_paths) not between 1 and 6
     or cardinality(upload_paths)<>(select count(distinct requested.path) from unnest(upload_paths) requested(path)) then
    raise exception 'invalid cleanup claim' using errcode='23514';
  end if;
  perform 1 from public.wanted_uploads where path=any(upload_paths) order by path for update;
  select count(*) into invalid_count from unnest(upload_paths) requested(path)
   left join public.wanted_uploads upload on upload.path=requested.path
   where upload.path is null or upload.owner_id<>actor_id or upload.bucket<>target_bucket
      or upload.state not in ('uploaded','cleanup_claimed');
  if invalid_count>0 then raise exception 'wanted upload is attached or unavailable' using errcode='P0001'; end if;
  update public.wanted_uploads set state='cleanup_claimed',updated_at=now() where path=any(upload_paths);
  return upload_paths;
end $$;

-- Wrap the existing serialized offer mutations. Registry synchronization and
-- the original row transition share one transaction and the same row locks.
alter function public.submit_wanted_offer(uuid,uuid,uuid,integer,text,text,text[]) rename to submit_wanted_offer_uncoordinated;
alter function public.mutate_wanted_offer(uuid,uuid,text,integer,text,text,text[]) rename to mutate_wanted_offer_uncoordinated;
revoke all on function public.submit_wanted_offer_uncoordinated(uuid,uuid,uuid,integer,text,text,text[]) from public,anon,authenticated,service_role;
revoke all on function public.mutate_wanted_offer_uncoordinated(uuid,uuid,text,integer,text,text,text[]) from public,anon,authenticated,service_role;

create function public.submit_wanted_offer(target_post_id uuid,actor_id uuid,client_offer_id uuid,offered_price integer,offered_description text,offered_message text,offered_photo_paths text[])
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  perform public.sync_wanted_offer_uploads(client_offer_id,actor_id,offered_photo_paths);
  result := public.submit_wanted_offer_uncoordinated(target_post_id,actor_id,client_offer_id,offered_price,offered_description,offered_message,offered_photo_paths);
  return result;
end $$;

create function public.mutate_wanted_offer(target_offer_id uuid,actor_id uuid,mutation text,offered_price integer default null,offered_description text default null,offered_message text default null,offered_photo_paths text[] default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if mutation='edit' then perform public.sync_wanted_offer_uploads(target_offer_id,actor_id,offered_photo_paths); end if;
  result := public.mutate_wanted_offer_uncoordinated(target_offer_id,actor_id,mutation,offered_price,offered_description,offered_message,offered_photo_paths);
  return result;
end $$;

create function public.create_wanted_post_with_uploads(actor_id uuid,post_title text,post_category text,post_max_budget integer,post_description text,post_location text,post_photo_urls text[],post_needed_by timestamptz)
returns uuid language plpgsql security definer set search_path='' as $$
declare post_id uuid := gen_random_uuid();
begin
  perform public.sync_wanted_post_uploads(post_id,actor_id,post_photo_urls);
  insert into public.wanted_posts(id,buyer_id,title,category,max_budget,description,location,photo_urls,needed_by)
  values(post_id,actor_id,post_title,post_category,post_max_budget,post_description,post_location,post_photo_urls,post_needed_by);
  return post_id;
end $$;

create function public.update_wanted_post_with_uploads(target_post_id uuid,actor_id uuid,post_title text,post_category text,post_max_budget integer,post_description text,post_location text,post_photo_urls text[],post_needed_by timestamptz)
returns uuid language plpgsql security definer set search_path='' as $$
declare locked public.wanted_posts%rowtype;
begin
  select * into locked from public.wanted_posts where id=target_post_id for update;
  if not found then raise exception 'not found' using errcode='P0002'; end if;
  if locked.buyer_id<>actor_id then raise exception 'forbidden' using errcode='42501'; end if;
  if locked.status<>'active' or locked.needed_by<=clock_timestamp() then raise exception 'not active' using errcode='P0001'; end if;
  perform public.sync_wanted_post_uploads(target_post_id,actor_id,post_photo_urls);
  update public.wanted_posts set title=post_title,category=post_category,max_budget=post_max_budget,
    description=post_description,location=post_location,photo_urls=post_photo_urls,needed_by=post_needed_by
   where id=target_post_id;
  return target_post_id;
end $$;

revoke all on table public.wanted_uploads from public,anon,authenticated;
revoke all on function public.register_wanted_upload(text,text,uuid,text) from public,anon,authenticated;
revoke all on function public.sync_wanted_offer_uploads(uuid,uuid,text[]) from public,anon,authenticated;
revoke all on function public.sync_wanted_post_uploads(uuid,uuid,text[]) from public,anon,authenticated;
revoke all on function public.claim_wanted_upload_cleanup(text[],text,uuid) from public,anon,authenticated;
revoke all on function public.submit_wanted_offer(uuid,uuid,uuid,integer,text,text,text[]) from public,anon,authenticated;
revoke all on function public.mutate_wanted_offer(uuid,uuid,text,integer,text,text,text[]) from public,anon,authenticated;
revoke all on function public.create_wanted_post_with_uploads(uuid,text,text,integer,text,text,text[],timestamptz) from public,anon,authenticated;
revoke all on function public.update_wanted_post_with_uploads(uuid,uuid,text,text,integer,text,text,text[],timestamptz) from public,anon,authenticated;
grant execute on function public.register_wanted_upload(text,text,uuid,text) to service_role;
grant execute on function public.claim_wanted_upload_cleanup(text[],text,uuid) to service_role;
grant execute on function public.submit_wanted_offer(uuid,uuid,uuid,integer,text,text,text[]) to service_role;
grant execute on function public.mutate_wanted_offer(uuid,uuid,text,integer,text,text,text[]) to service_role;
grant execute on function public.create_wanted_post_with_uploads(uuid,text,text,integer,text,text,text[],timestamptz) to service_role;
grant execute on function public.update_wanted_post_with_uploads(uuid,uuid,text,text,integer,text,text,text[],timestamptz) to service_role;
