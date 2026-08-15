-- Make feed search indexable.
--
-- The feed matches with `title ilike '%term%' or description ilike '%term%'`.
-- A leading wildcard cannot use a btree index, so every keystroke scanned the
-- whole listings table twice — fine at seed size, visibly laggy as it grows.
--
-- pg_trgm indexes trigrams rather than prefixes, which is exactly the shape
-- ILIKE '%x%' needs. GIN over gin_trgm_ops lets the planner use an index for
-- both columns.

create extension if not exists pg_trgm;

create index if not exists listings_title_trgm
  on public.listings using gin (title gin_trgm_ops);

-- description is nullable; trigram indexes skip nulls, so no partial predicate
-- is needed here.
create index if not exists listings_description_trgm
  on public.listings using gin (description gin_trgm_ops);
