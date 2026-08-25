-- Reverse marketplace: buyers publish wanted posts and sellers respond with
-- private offers. Offer image paths remain storage paths (not public URLs) so
-- the API can sign them only for the buyer and seller.

create table public.wanted_posts (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 60),
  category text not null check (category in ('goods','services','housing')),
  max_budget integer not null check (max_budget > 0),
  description text not null check (char_length(trim(description)) between 1 and 2000),
  location text not null check (char_length(trim(location)) between 1 and 160),
  place_name text, lat double precision, lng double precision,
  photo_urls text[] not null default '{}' check (cardinality(photo_urls) <= 6),
  needed_by timestamptz not null,
  status text not null default 'active' check (status in ('active','fulfilled','expired','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.wanted_offers (
  id uuid primary key default gen_random_uuid(),
  wanted_post_id uuid not null references public.wanted_posts(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  price integer not null check (price > 0),
  description text not null check (char_length(trim(description)) between 1 and 2000),
  message text not null check (char_length(trim(message)) between 1 and 1000),
  photo_paths text[] not null check (cardinality(photo_paths) between 1 and 6),
  status text not null default 'pending' check (status in ('pending','accepted','declined','withdrawn','expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  completed_at timestamptz,
  check (seller_id <> buyer_id)
);

create unique index wanted_offers_seller_post_uniq on public.wanted_offers(wanted_post_id, seller_id);
create index wanted_posts_feed_idx on public.wanted_posts(status, created_at desc);
create index wanted_posts_category_idx on public.wanted_posts(category, status, needed_by);
create index wanted_posts_buyer_idx on public.wanted_posts(buyer_id, created_at desc);
create index wanted_offers_buyer_idx on public.wanted_offers(buyer_id, status, created_at desc);
create index wanted_offers_seller_idx on public.wanted_offers(seller_id, status, created_at desc);

-- `now()` is deliberately not a CHECK constraint here: PostgreSQL assumes
-- CHECK expressions are immutable, while a deadline needs to be re-evaluated
-- for each insert and whenever the editable deadline changes.
create or replace function public.validate_wanted_post_deadline()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.needed_by <= clock_timestamp() then
    raise exception 'wanted post needed_by must be in the future'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger wanted_posts_require_future_needed_by
  before insert or update of needed_by on public.wanted_posts
  for each row execute function public.validate_wanted_post_deadline();

create or replace function public.set_wanted_post_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new is distinct from old then
    new.updated_at = clock_timestamp();
  end if;
  return new;
end;
$$;

create trigger wanted_posts_set_updated_at
  before update on public.wanted_posts
  for each row execute function public.set_wanted_post_updated_at();

-- Direct client reads support mobile/realtime. Mutations that resolve posts or
-- offers stay in API routes using the service role, so clients cannot forge a
-- status transition, change the buyer/seller identity, or set completed_at.
grant select, insert on public.wanted_posts to authenticated;
revoke update on public.wanted_posts from authenticated;
grant update (
  title,
  category,
  max_budget,
  description,
  location,
  place_name,
  lat,
  lng,
  photo_urls,
  needed_by
) on public.wanted_posts to authenticated;
grant select on public.wanted_offers to authenticated;

alter table public.wanted_posts enable row level security;
alter table public.wanted_offers enable row level security;

-- `blocks` has owner-only RLS, so the active-post policy cannot inspect both
-- directions through a normal subquery. This narrowly scoped function runs as
-- the migration owner, reads only existence, and still uses the caller's auth
-- context to evaluate both sides of the relationship.
create or replace function public.wanted_users_are_blocked(other_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.blocks
    where (blocker_id = auth.uid() and blocked_id = other_user_id)
       or (blocker_id = other_user_id and blocked_id = auth.uid())
  );
$$;

revoke all on function public.wanted_users_are_blocked(uuid) from public, anon, authenticated;
grant execute on function public.wanted_users_are_blocked(uuid) to authenticated;

create policy "wanted_posts_select_active" on public.wanted_posts
  for select to authenticated
  using (status = 'active' and not public.wanted_users_are_blocked(buyer_id));

create policy "wanted_posts_select_owner" on public.wanted_posts
  for select to authenticated
  using (buyer_id = auth.uid());

-- A post starts active and unresolved. The update policy intentionally only
-- permits an owner to edit an already-active post while keeping it active;
-- lifecycle and identity fields are API-owned.
create policy "wanted_posts_insert_owner" on public.wanted_posts
  for insert to authenticated
  with check (
    buyer_id = auth.uid()
    and status = 'active'
    and resolved_at is null
  );

create policy "wanted_posts_update_owner_active" on public.wanted_posts
  for update to authenticated
  using (buyer_id = auth.uid() and status = 'active')
  with check (
    buyer_id = auth.uid()
    and status = 'active'
    and resolved_at is null
  );

create policy "wanted_offers_select_participant" on public.wanted_offers
  for select to authenticated
  using (buyer_id = auth.uid() or seller_id = auth.uid());

-- Wanted-post reference photos are public like listing photos. Native clients
-- upload inside their own uid directory; server routes may use the service
-- role for post-id-based paths.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wanted-reference-photos',
  'wanted-reference-photos',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "wanted_reference_photos_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'wanted-reference-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "wanted_reference_photos_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'wanted-reference-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'wanted-reference-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "wanted_reference_photos_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'wanted-reference-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Offer media is never readable directly by clients. The API verifies offer
-- participation and mints signed URLs. Upload/delete policies require the
-- seller-owned {seller_id}/{offer_id}/... prefix; offer IDs are client UUIDs
-- generated before uploading so every path can be checked before row creation.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wanted-offer-photos',
  'wanted-offer-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "wanted_offer_photos_insert_owner_offer"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'wanted-offer-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );

create policy "wanted_offer_photos_update_owner_offer"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'wanted-offer-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
  with check (
    bucket_id = 'wanted-offer-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );

create policy "wanted_offer_photos_delete_owner_offer"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'wanted-offer-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );
