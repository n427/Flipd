-- Dev seed: dummy data for both inbox tabs.
--
--   Requests  → requests on your listings (pending / approved / completed),
--                each with the buyer's intro message
--   Messages  → a live conversation and a wrapped-up one, with threads hanging
--                off the approved and completed requests
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
--   e0000000-…-102 / -105 / -106   requests in your inbox
--   e0000000-…-301 / -302          message threads on the approved ones
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
  ('0041d0a0-c695-4fe8-948e-f6041c9d9058', 'event', 'Matcha popup at Leavey — Friday',
   'One-day matcha cart outside Leavey. Iced matcha, strawberry matcha, oat milk available. Cash or Venmo.',
   7, false, 'Outside Leavey Library',
   '{https://picsum.photos/seed/flipd-matcha/800/800}',
   date_trunc('hour', now()) + interval '2 days' + interval '10 hours',
   date_trunc('hour', now()) + interval '2 days' + interval '14 hours',
   interval '5 days'),
  ('5b8695b8-09e0-4441-a70a-7d1c4dadbb8a', 'goods', 'Desk lamp, warm LED',
   'Barely used desk lamp, three brightness settings. Pickup at USC Village.',
   20, true, 'USC Village',
   '{https://picsum.photos/seed/flipd-lamp/800/800}',
   null, null, interval '6 days'),
  ('b1a25383-409b-4907-890d-1def530a0870', 'goods', 'Mini fridge, dorm size',
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
  ('485ee5fd-ea60-4657-8541-09bca41ec8e4'::uuid, 'd0000000-0000-4000-8000-000000000001'::uuid,
   'food', 'Banana bread, baked this morning',
   'Two loaves left, brown butter walnut. Pickup near 30th & Hoover today.',
   9, false, '30th & Hoover', '{email}',
   '{https://picsum.photos/seed/flipd-banana/800/800}', '{50% 50%}',
   null, null, now() - interval '2 hours'),
  ('7aeff56d-9ea8-4e06-b9e8-7face63f4b13'::uuid, 'd0000000-0000-4000-8000-000000000001'::uuid,
   'services', 'Resume review, Marshall senior',
   'One-page resume edit with comments back in 24h. Recruiting season rates.',
   25, true, 'Zoom', '{email}',
   '{https://picsum.photos/seed/flipd-resume/800/800}', '{50% 50%}',
   null, null, now() - interval '7 hours'),
  ('98d366c2-c3cd-4389-aff3-61a286ef5f7a'::uuid, 'd0000000-0000-4000-8000-000000000001'::uuid,
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

-- ── REQUESTS tab: incoming requests ──────────────────────────────────
-- Filed by the demo profile against YOUR listings, in three states so the tab
-- shows a pending row to act on, an approved row linking into a conversation,
-- and a completed row that can be rated.
--
-- intro_message is what the seller actually decides on, so each one reads like
-- a real ask rather than a placeholder. None contain contact details: the API
-- would reject those with a 422, and seeding around the rule would misrepresent
-- what the product allows.
--
-- listing_title is denormalized on purpose: 008_requests_survive_delete.sql
-- keeps requests readable after a listing is deleted.
--
-- Note reveal_requests_live_uniq allows only ONE pending/approved row per
-- (listing, buyer) pair, which is why each request targets a different listing.
insert into public.reveal_requests (
  id, listing_id, listing_title, buyer_id, seller_id,
  status, offer, intro_message, created_at, expires_at, resolved_at
)
select v.id::uuid, l.id, l.title,
       'd0000000-0000-4000-8000-000000000001'::uuid, l.seller_id,
       v.status, v.offer, v.intro,
       now() - v.age, now() - v.age + interval '72 hours', v.resolved
from (values
  ('28654ad9-9ea1-43b9-b102-b099873719f3', '5b8695b8-09e0-4441-a70a-7d1c4dadbb8a',
   'pending',   18,
   'Is this still around? I am in Cardinal Gardens and could grab it tomorrow afternoon if that works.',
   interval '3 hours',  null::timestamptz),
  ('504c5049-586f-4272-b523-7d297e642d3e', 'b1a25383-409b-4907-890d-1def530a0870',
   'approved',  60,
   'Moving into a single next week and this would be perfect. Could do pickup Saturday morning.',
   interval '1 day',    now() - interval '20 hours'),
  ('01b261ae-37e3-46b2-b01b-2f724f5cd4ee', '0041d0a0-c695-4fe8-948e-f6041c9d9058',
   'completed', null,
   'Are you doing the Leavey popup again this week? Wanted to bring a couple friends.',
   interval '4 days', now() - interval '3 days')
) as v(id, listing_id, status, offer, intro, age, resolved)
join public.listings l on l.id = v.listing_id::uuid
on conflict (id) do update set
  status        = excluded.status,
  offer         = excluded.offer,
  intro_message = excluded.intro_message,
  created_at    = excluded.created_at,
  expires_at    = excluded.expires_at,
  resolved_at   = excluded.resolved_at;

-- ── MESSAGES: a thread per approved request ──────────────────────────
-- Approving is what opens a thread, so only the approved and completed
-- requests get one. request_id is unique, hence the upsert.
insert into public.message_threads (
  id, request_id, listing_id, listing_title, buyer_id, seller_id, created_at, last_message_at
)
select v.id::uuid, r.id, r.listing_id, r.listing_title, r.buyer_id, r.seller_id,
       r.resolved_at, r.resolved_at
from (values
  ('d727521c-b039-4be0-ba0b-74eb395215d2', '504c5049-586f-4272-b523-7d297e642d3e'),
  ('b422f69c-32ee-43f8-a999-88c3b379b777', '01b261ae-37e3-46b2-b01b-2f724f5cd4ee')
) as v(id, request_id)
join public.reveal_requests r on r.id = v.request_id::uuid
on conflict (request_id) do update set
  listing_title = excluded.listing_title,
  created_at    = excluded.created_at;

-- A short back-and-forth in the active thread, and a closed-out one in the
-- completed thread. created_at is staggered so ordering is stable and the
-- trigger leaves last_message_at on the newest row.
--
-- Note the buyer here is the DEMO profile, so in your inbox these read as
-- messages from Flipd Team. The last message is theirs, which leaves the
-- thread unread for you.
delete from public.messages
where thread_id in (
  'd727521c-b039-4be0-ba0b-74eb395215d2'::uuid,
  'b422f69c-32ee-43f8-a999-88c3b379b777'::uuid
);

insert into public.messages (thread_id, sender_id, body, created_at)
select v.thread_id::uuid,
       case when v.from_buyer then t.buyer_id else t.seller_id end,
       v.body,
       now() - v.age
from (values
  ('d727521c-b039-4be0-ba0b-74eb395215d2', true,
   'Thanks for approving. Saturday morning still good?', interval '19 hours'),
  ('d727521c-b039-4be0-ba0b-74eb395215d2', false,
   'Yep, anytime after 10 works. I am right by the village.', interval '18 hours'),
  ('d727521c-b039-4be0-ba0b-74eb395215d2', true,
   'Perfect, I will bring cash. Does 11 work?', interval '2 hours'),
  ('b422f69c-32ee-43f8-a999-88c3b379b777', true,
   'Made it out to the popup, the strawberry matcha was great.', interval '3 days'),
  ('b422f69c-32ee-43f8-a999-88c3b379b777', false,
   'So glad you came by. Doing it again in two weeks.', interval '3 days' - interval '20 minutes')
) as v(thread_id, from_buyer, body, age)
join public.message_threads t on t.id = v.thread_id::uuid;

-- ── ACTIVITY tab: a popup reminder you've opted into ─────────────────
-- Points at the demo thrift popup above, which starts tomorrow, so the
-- day-before reminder job (api/cron/sweep) has a live row to find.
insert into public.popup_reminders (user_id, listing_id, reminded_24h_at)
select p.id, '98d366c2-c3cd-4389-aff3-61a286ef5f7a'::uuid, null
from public.profiles p
where coalesce(p.is_demo, false) = false
order by p.created_at desc
limit 1
on conflict (user_id, listing_id) do update set reminded_24h_at = null;

commit;

-- What landed:
--   select title, category, event_start, created_at from public.listings
--     where id::text like 'e0000000%' order by created_at desc;
--   select listing_title, status, offer, intro_message from public.reveal_requests
--     where id::text like 'e0000000%';
--   select t.listing_title, m.body, m.created_at from public.messages m
--     join public.message_threads t on t.id = m.thread_id
--     order by m.created_at;
--   select * from public.popup_reminders;
