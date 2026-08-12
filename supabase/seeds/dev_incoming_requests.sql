-- Dev seed: incoming requests addressed to nicolexzha@gmail.com.
--
-- Fills the "People who want to talk" column with something to look at:
-- one pending request to act on, one approved with a live conversation, and
-- one declined, so every row state renders.
--
--   psql "$DATABASE_URL" -f supabase/seeds/dev_incoming_requests.sql
--   -- or paste the whole file into the Supabase SQL editor
--
-- Plain SQL only, no psql backslash commands, so the Supabase SQL editor
-- accepts it. Safe to re-run: fixed UUIDs, upserted.
--
--   f0000000-…-401 / -402   listings owned by you (if you have none already)
--   f0000000-…-501 … -503   the incoming requests
--   f0000000-…-601 / -602   threads on the approved one
--   d0000000-…-001          the demo "Flipd Team" profile, acting as buyer
--
-- The recipient is resolved from auth.users by email, so nothing needs editing.
-- If that account does not exist yet, this is a no-op: sign in once, re-run.

begin;

-- Buyer. 006_seed_demo.sql normally creates it; recreate if that never ran.
insert into public.profiles (id, display_name, handle, school_unit, class_year, is_demo, contact_email)
values ('d0000000-0000-4000-8000-000000000001', 'Flipd Team', 'flipd.team', 'Marshall', 'Senior', true, 'team@flipdcampus.com')
on conflict (id) do nothing;

-- Two listings of yours for the requests to attach to. Skipped silently if
-- your account already owns listings, since the requests below prefer those.
insert into public.listings (
  id, seller_id, category, title, description, price, negotiable,
  location, contact, photo_urls, photo_focus, created_at
)
select v.id::uuid, p.id, v.category, v.title, v.description, v.price, true,
       v.location, '{email}', v.photo::text[], '{50% 50%}', now() - v.age
from public.profiles p
cross join (values
  ('354cd55e-ee6f-4c39-bcd6-fa455c5df704', 'goods', 'Standing desk converter',
   'Barely used, raises to standing height. Pickup near campus.', 75,
   'USC Village', '{https://picsum.photos/seed/flipd-desk/800/800}', interval '3 days'),
  ('5060eb56-c3cd-4f09-9640-f0772d7f3730', 'services', 'Calc 125 tutoring',
   'One-on-one help, first session half price.', 40,
   'Leavey Library', '{https://picsum.photos/seed/flipd-tutor2/800/800}', interval '5 days')
) as v(id, category, title, description, price, location, photo, age)
where p.id = (
  select u.id from auth.users u where lower(u.email) = 'nicolexzha@gmail.com' limit 1
)
on conflict (id) do update set archived = false, created_at = excluded.created_at;

-- ── Incoming requests ────────────────────────────────────────────────
-- Filed BY the demo profile AGAINST your listings, so they land in your
-- "People who want to talk" column. Each targets a different listing:
-- reveal_requests_live_uniq allows only one live row per (listing, buyer).
--
-- Intro messages contain no contact details; the API rejects those with a 422,
-- and seeding around the rule would misrepresent what the product allows.
insert into public.reveal_requests (
  id, listing_id, listing_title, buyer_id, seller_id,
  status, offer, intro_message, created_at, expires_at, resolved_at
)
select v.id::uuid, l.id, l.title,
       'd0000000-0000-4000-8000-000000000001'::uuid, l.seller_id,
       v.status, v.offer, v.intro,
       now() - v.age, now() - v.age + interval '72 hours', v.resolved
from (values
  ('891afcf7-fa4c-4003-95b8-4cdfe05bbc58', '354cd55e-ee6f-4c39-bcd6-fa455c5df704',
   'pending', 65,
   'Is the desk converter still available? I could pick it up Thursday afternoon if that works for you.',
   interval '5 hours', null::timestamptz),
  ('010bd5ac-a0d3-4435-b512-201f9897c085', '5060eb56-c3cd-4f09-9640-f0772d7f3730',
   'approved', null,
   'I have a Calc 125 midterm in two weeks and could really use help with integrals. Are you free weekday evenings?',
   interval '2 days', now() - interval '2 days' + interval '40 minutes'),
  ('451d56e9-06b1-4240-b824-fce5d0d62e49', '354cd55e-ee6f-4c39-bcd6-fa455c5df704',
   'declined', 50,
   'Would you take 50 for the desk? I can grab it today.',
   interval '6 days', now() - interval '6 days' + interval '3 hours')
) as v(id, listing_id, status, offer, intro, age, resolved)
join public.listings l on l.id = v.listing_id::uuid
on conflict (id) do update set
  status        = excluded.status,
  offer         = excluded.offer,
  intro_message = excluded.intro_message,
  created_at    = excluded.created_at,
  expires_at    = excluded.expires_at,
  resolved_at   = excluded.resolved_at;

-- Approving is what opens a thread, so only the approved request gets one.
insert into public.message_threads (
  id, request_id, listing_id, listing_title, buyer_id, seller_id, created_at, last_message_at
)
select '820669ca-225d-436e-8dd4-cd581575243b'::uuid, r.id, r.listing_id, r.listing_title,
       r.buyer_id, r.seller_id, r.resolved_at, r.resolved_at
from public.reveal_requests r
where r.id = '010bd5ac-a0d3-4435-b512-201f9897c085'::uuid
on conflict (request_id) do update set listing_title = excluded.listing_title;

-- A short exchange, ending on the buyer's message so the thread reads unread.
delete from public.messages
where thread_id = '820669ca-225d-436e-8dd4-cd581575243b'::uuid;

insert into public.messages (thread_id, sender_id, body, created_at)
select t.id,
       case when v.from_buyer then t.buyer_id else t.seller_id end,
       v.body,
       now() - v.age
from (values
  (true,  'Thanks for approving! Are weekday evenings still open?', interval '2 days'),
  (false, 'Yes, Tuesday and Thursday after 6 both work for me.', interval '1 day'),
  (true,  'Tuesday is perfect. Should I bring the textbook?', interval '3 hours')
) as v(from_buyer, body, age)
join public.message_threads t on t.id = '820669ca-225d-436e-8dd4-cd581575243b'::uuid;

commit;

-- What landed:
--   select listing_title, status, offer, left(intro_message, 50) as intro
--     from public.reveal_requests where id::text like 'f0000000%';
--   select body, created_at from public.messages
--     where thread_id = '820669ca-225d-436e-8dd4-cd581575243b' order by created_at;
