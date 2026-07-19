-- Exact map coordinates + human place name for a listing's pickup spot.
-- All nullable: old listings and text-only entries have no map.
alter table public.listings
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists place_name text;
