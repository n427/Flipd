-- Dev seed: dummy data for both inbox tabs.
--
--   Requests  → reveal requests on your listings (pending / approved / completed)
--   Activity  → recent campus posts, plus a popup you've set a reminder for
--
-- Run by hand against a dev/staging database. NOT a migration — it lives
-- outside supabase/migrations so it never auto-applies to production.
--
--   psql "$DATABASE_URL" -f supabase/seeds/dev_popup_request.sql
--   -- or paste the whole file into the Supabase SQL editor
--
-- Plain SQL only: no psql backslash commands (\set etc), because the Supabase
-- SQL editor talks straight to the server and would reject them. That is why
-- the fixed UUIDs below are written out in full rather than aliased.
--
-- Safe to re-run: everything is keyed off those fixed UUIDs and upserted, so a
-- second run refreshes the rows (and all the timestamps) instead of duplicating.
--
--   e0000000-…-101 / -103 / -104   listings owned by YOU (popup + two goods)
--   e0000000-…-201 … -203          listings owned by the demo profile (Activity)
--   e0000000-…-102 / -105 / -106   reveal requests in your inbox
--   d0000000-…-001                 the demo "Flipd Team" profile
--
-- WHO OWNS WHAT
--   Your listings are seeded onto the NEWEST real (non-demo) profile, i.e. the
--   account you most recently signed up with. Requests are then filed by the
--   demo "Flipd Team" profile as the BUYER, so they land in YOUR seller inbox.
--   That is the inverse of 006_seed_demo.sql, where the demo profile sells.
--
-- If there is no real profile yet, this is a no-op: sign in once, then re-run.

begin;

-- The demo profile is the buyer, and the seller of the Activity posts.
-- 006_seed_demo.sql normally creates it; recreate it here if that seed was
-- never run, so this file stands alone.
insert into public.profiles (id, display_name, handle, school_unit, class_year, is_demo, contact_email)
values ('d0000000-0000-4000-8000-000000000001', 'Flipd Team', 'flipd.team', 'Flipd', '', true, 'team@flipdcampus.com')
on conflict (id) do nothing;

-- ── YOUR listings ────────────────────────────────────────────────────
-- Category 'event' is what the app calls a popup (see CategoryId in
-- src/lib/types.ts). event_start/event_end drive the countdown pill and the
-- day-before reminder job, so they are seeded relative to now() — a re-run
-- always produces an upcoming event rather than a stale past one.
insert into public.listings (
  id, seller_id, category, title, description, price, negotiable,
  location, contact, photo_urls, photo_focus, event_start, event_end, created_at
)
select v.id::uuid, p.id, v.category, v.title, v.description, v.price, v.negotiable,
       v.location, '{email}', v.photo_urls::text[], '{50% 50%}',
       v.event_start, v.event_end, now() - v.age
from public.profiles p
cross join (values
  ('e0000000-0000-4000-8000-000000000101', 'event', 'Matcha popup at Leavey — Friday',
   'One-day matcha cart outside Leavey. Iced matcha, strawberry matcha, oat milk available. Cash or Venmo.',
   7, false, 'Outside Leavey Library',
   '{https://picsum.photos/seed/flipd-matcha/800/800}',
   date_trunc('hour', now()) + interval '2 days' + interval '10 hours',
   date_trunc('hour', now()) + interval '2 days' + interval '14 hours',
   interval '5 days'),
  ('e0000000-0000-4000-8000-000000000103', 'goods', 'Desk lamp, warm LED',
   'Barely used desk lamp, three brightness settings. Pickup at USC Village.',
   20, true, 'USC Village',
   '{https://picsum.photos/seed/flipd-lamp/800/800}',
   null, null, interval '6 days'),
  ('e0000000-0000-4000-8000-000000000104', 'goods', 'Mini fridge, dorm size',
   'Clean 3.2 cu ft fridge, works perfectly. Moving out so it needs to go this week.',
   65, true, 'Cardinal Gardens',
   '{https://picsum.photos/seed/flipd-fridge/800/800}',
   null, null, interval '8 days')
) as v(id, category, title, description, price, negotiable, location, photo_urls, event_start, event_end, age)
where coalesce(p.is_demo, false) = false
  and p.id = (select id from public.profiles where coalesce(is_demo, false) = false order by created_at desc limit 1)
on conflict (id) do update set
  event_start = excluded.event_start,
  event_end   = excluded.event_end,
  created_at  = excluded.created_at,
  archived    = false;

-- ── ACTIVITY tab: recent posts by other students ─────────────────────
-- The Activity feed is "what's new on campus" (fetchFeed sort=recent), so these
-- are owned by the demo profile and dated within the last day to sit on top.
-- The third is a popup, so the reminder below has something to point at.
insert into public.listings (
  id, seller_id, category, title, description, price, negotiable,
  location, contact, photo_urls, photo_focus, event_start, event_end, created_at
)
values
  ('e0000000-0000-4000-8000-000000000201'::uuid, 'd0000000-0000-4000-8000-000000000001'::uuid,
   'food', 'Banana bread, baked this morning',
   'Two loaves left, brown butter walnut. Pickup near 30th & Hoover today.',
   9, false, '30th & Hoover', '{email}',
   '{https://picsum.photos/seed/flipd-banana/800/800}', '{50% 50%}',
   null, null, now() - interval '2 hours'),
  ('e0000000-0000-4000-8000-000000000202'::uuid, 'd0000000-0000-4000-8000-000000000001'::uuid,
   'services', 'Resume review, Marshall senior',
   'One-page resume edit with comments back in 24h. Recruiting season rates.',
   25, true, 'Zoom', '{email}',
   '{https://picsum.photos/seed/flipd-resume/800/800}', '{50% 50%}',
   null, null, now() - interval '7 hours'),
  ('e0000000-0000-4000-8000-000000000203'::uuid, 'd0000000-0000-4000-8000-000000000001'::uuid,
   'event', 'Thrift popup on Trousdale — Saturday',
   'Student-run thrift racks on Trousdale. Everything $5–$20, Venmo accepted.',
   5, false, 'Trousdale Pkwy', '{email}',
   '{https://picsum.photos/seed/flipd-thrift/800/800}', '{50% 50%}',
   date_trunc('hour', now()) + interval '1 day' + interval '11 hours',
   date_trunc('hour', now()) + interval '1 day' + interval '16 hours',
   now() - interval '20 hours')
on conflict (id) do update set
  event_start = excluded.event_start,
  event_end   = excluded.event_end,
  created_at  = excluded.created_at,
  archived    = false;

-- ── REQUESTS tab: incoming reveal requests ───────────────────────────
-- Filed by the demo profile against YOUR listings, in three different states so
-- the tab shows a pending action, an approved contact block, and a completed
-- row that can be rated.
--
-- listing_title is denormalized on purpose: 008_requests_survive_delete.sql
-- keeps requests readable after a listing is deleted.
--
-- Note reveal_requests_live_uniq allows only ONE pending/approved row per
-- (listing, buyer) pair — that is why each request below targets a different
-- listing rather than stacking on one.
insert into public.reveal_requests (
  id, listing_id, listing_title, buyer_id, seller_id,
  status, offer, buyer_contact, created_at, expires_at, resolved_at
)
select v.id::uuid, l.id, l.title,
       'd0000000-0000-4000-8000-000000000001'::uuid, l.seller_id,
       v.status, v.offer, '{email}',
       now() - v.age, now() - v.age + interval '72 hours', v.resolved
from (values
  ('e0000000-0000-4000-8000-000000000102', 'e0000000-0000-4000-8000-000000000103',
   'pending',   18, interval '3 hours',  null::timestamptz),
  ('e0000000-0000-4000-8000-000000000105', 'e0000000-0000-4000-8000-000000000104',
   'approved',  60, interval '1 day',    now() - interval '20 hours'),
  ('e0000000-0000-4000-8000-000000000106', 'e0000000-0000-4000-8000-000000000101',
   'completed', null, interval '4 days', now() - interval '3 days')
) as v(id, listing_id, status, offer, age, resolved)
join public.listings l on l.id = v.listing_id::uuid
on conflict (id) do update set
  status      = excluded.status,
  offer       = excluded.offer,
  created_at  = excluded.created_at,
  expires_at  = excluded.expires_at,
  resolved_at = excluded.resolved_at;

-- ── ACTIVITY tab: a popup reminder you've opted into ─────────────────
-- Points at the demo thrift popup above, which starts tomorrow, so the
-- day-before reminder job (api/cron/popup-reminders) has a live row to find.
insert into public.popup_reminders (user_id, listing_id, reminded_at)
select p.id, 'e0000000-0000-4000-8000-000000000203'::uuid, null
from public.profiles p
where coalesce(p.is_demo, false) = false
order by p.created_at desc
limit 1
on conflict (user_id, listing_id) do update set reminded_at = null;

commit;

-- What landed:
--   select title, category, event_start, created_at from public.listings
--     where id::text like 'e0000000%' order by created_at desc;
--   select listing_title, status, offer, expires_at from public.reveal_requests
--     where id::text like 'e0000000%';
--   select * from public.popup_reminders;
