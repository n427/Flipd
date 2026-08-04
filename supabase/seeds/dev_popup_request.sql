-- Dev seed: one popup (event) listing + one incoming reveal request.
--
-- Run by hand against a dev/staging database when you need something in the
-- Requests inbox to look at. NOT a migration — it lives outside
-- supabase/migrations so it never auto-applies to production.
--
--   psql "$DATABASE_URL" -f supabase/seeds/dev_popup_request.sql
--   -- or paste the whole file into the Supabase SQL editor
--
-- Plain SQL only: no psql backslash commands (\set etc), because the Supabase
-- SQL editor talks straight to the server and would reject them. That is why
-- the fixed UUIDs below are written out in full rather than aliased.
--
-- Safe to re-run: everything is keyed off those fixed UUIDs and upserted, so a
-- second run refreshes the rows (and the event window) instead of duplicating.
--
--   e0000000-…-101  the popup listing
--   e0000000-…-102  the reveal request
--   d0000000-…-001  the demo "Flipd Team" profile (from 006_seed_demo.sql)
--
-- WHO OWNS WHAT
--   The popup listing is seeded onto the NEWEST real (non-demo) profile, i.e.
--   the account you most recently signed up with. The request is then filed by
--   the demo "Flipd Team" profile as the BUYER, so it lands in YOUR seller
--   inbox at /requests. That is the inverse of 006_seed_demo.sql, where the
--   demo profile is the seller.
--
-- If there is no real profile yet, this is a no-op: sign in once, then re-run.

begin;

-- The demo profile is the buyer. 006_seed_demo.sql normally creates it; recreate
-- it here if that seed was never run, so this file stands alone.
insert into public.profiles (id, display_name, handle, school_unit, class_year, is_demo, contact_email)
values ('d0000000-0000-4000-8000-000000000001', 'Flipd Team', 'flipd.team', 'Flipd', '', true, 'team@flipdcampus.com')
on conflict (id) do nothing;

-- ── Popup listing ────────────────────────────────────────────────────
-- Category 'event' is what the app calls a popup (see CategoryId in
-- src/lib/types.ts). event_start/event_end drive the countdown pill and the
-- day-before reminder job, so they are seeded relative to now() — a re-run
-- always produces an upcoming event rather than a stale past one.
insert into public.listings (
  id, seller_id, category, title, description, price, negotiable,
  location, contact, photo_urls, photo_focus, event_start, event_end
)
select
  'e0000000-0000-4000-8000-000000000101'::uuid,
  p.id,
  'event',
  'Matcha popup at Leavey — Friday',
  'One-day matcha cart outside Leavey. Iced matcha, strawberry matcha, oat milk available. Cash or Venmo.',
  7,
  false,
  'Outside Leavey Library',
  '{email}',
  '{https://picsum.photos/seed/flipd-matcha/800/800}',
  '{50% 50%}',
  date_trunc('hour', now()) + interval '2 days' + interval '10 hours',
  date_trunc('hour', now()) + interval '2 days' + interval '14 hours'
from public.profiles p
where coalesce(p.is_demo, false) = false
order by p.created_at desc
limit 1
on conflict (id) do update set
  event_start = excluded.event_start,
  event_end   = excluded.event_end,
  archived    = false;

-- ── Incoming reveal request ──────────────────────────────────────────
-- Filed by the demo profile against one of YOUR listings, so it appears as a
-- pending request in your seller inbox. Prefers a non-popup listing (a popup is
-- free to attend, so an offer reads oddly there) and falls back to the popup
-- above if that is all you have.
--
-- listing_title is denormalized on purpose: 008_requests_survive_delete.sql
-- keeps requests readable after a listing is deleted.
insert into public.reveal_requests (
  id, listing_id, listing_title, buyer_id, seller_id,
  status, offer, buyer_contact, created_at, expires_at
)
select
  'e0000000-0000-4000-8000-000000000102'::uuid,
  l.id,
  l.title,
  'd0000000-0000-4000-8000-000000000001'::uuid,
  l.seller_id,
  'pending',
  case when l.price > 0 then greatest(1, (l.price * 0.9)::int) else null end,
  '{email}',
  now() - interval '3 hours',
  now() + interval '69 hours'
from public.listings l
join public.profiles p on p.id = l.seller_id
where coalesce(p.is_demo, false) = false
  and coalesce(l.archived, false) = false
  and l.seller_id <> 'd0000000-0000-4000-8000-000000000001'::uuid
order by (l.category = 'event'), l.created_at desc
limit 1
on conflict (id) do update set
  status     = 'pending',
  created_at = excluded.created_at,
  expires_at = excluded.expires_at,
  resolved_at = null;

commit;

-- What landed:
--   select title, category, event_start from public.listings
--     where id = 'e0000000-0000-4000-8000-000000000101';
--   select listing_title, status, offer, expires_at from public.reveal_requests
--     where id = 'e0000000-0000-4000-8000-000000000102';
