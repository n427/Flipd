-- Table has 0 rows; drop-and-replace the text seller_id safely.
alter table public.listings drop column seller_id;
alter table public.listings
  add column seller_id uuid not null references public.profiles (id);
create index listings_seller_id_idx on public.listings (seller_id);
create index listings_feed_idx on public.listings (archived, created_at desc);
