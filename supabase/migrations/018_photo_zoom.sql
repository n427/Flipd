-- Per-photo zoom, alongside photo_focus. Lets a seller scale a photo up to
-- crop out baked-in letterbox bars (screenshots, screen recordings) that
-- object-fit: cover alone can't remove.
-- 1 = no zoom. Stored as text[] to mirror photo_focus's shape and its
-- "index matches photo_urls" contract.
alter table public.listings
  add column if not exists photo_zoom text[] not null default '{}';
