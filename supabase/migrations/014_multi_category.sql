-- Listings can carry more than one category. Non-destructive: the original
-- single `category` column stays as the read-time fallback; `categories`
-- backfills from it so existing rows keep displaying.
alter table public.listings add column categories text[] not null default '{}';
update public.listings set categories = array[category] where cardinality(categories) = 0;
