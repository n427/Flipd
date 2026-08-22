-- Flipd App Store screenshot data: Want to talk + Conversations.
--
-- 1. Replace YOUR_USC_EMAIL@usc.edu below with the email used on TestFlight.
-- 2. Paste this whole seed section into the Supabase SQL editor and run it.
-- 3. Pull to refresh Requests in the app and choose All time.
--
-- Safe to re-run: every screenshot row has a fixed UUID and is upserted.
-- It creates only rows whose IDs begin with a110/a220/a330/a440/a550.

begin;

create temporary table screenshot_seed_config (viewer_email text primary key) on commit drop;
insert into screenshot_seed_config values ('YOUR_USC_EMAIL@usc.edu');

do $$
begin
  if not exists (
    select 1 from auth.users u
    join screenshot_seed_config c on lower(u.email) = lower(c.viewer_email)
  ) then
    raise exception 'Screenshot account not found. Replace YOUR_USC_EMAIL@usc.edu, sign in once, and run again.';
  end if;
end $$;

-- Screenshot-only counterpart profiles. They do not have login identities.
insert into public.profiles (id, display_name, handle, school_unit, class_year, avatar_url, is_demo)
values
  ('a1100000-0000-4000-8000-000000000001', 'Maya Chen', 'maya.screenshots', 'Marshall', 'Junior',
   'https://i.pravatar.cc/300?img=47', true),
  ('a1100000-0000-4000-8000-000000000002', 'Jordan Lee', 'jordan.screenshots', 'Viterbi', 'Senior',
   'https://i.pravatar.cc/300?img=12', true),
  ('a1100000-0000-4000-8000-000000000003', 'Sofia Martinez', 'sofia.screenshots', 'Annenberg', 'Sophomore',
   'https://i.pravatar.cc/300?img=32', true)
on conflict (id) do update set
  display_name = excluded.display_name,
  school_unit = excluded.school_unit,
  class_year = excluded.class_year,
  avatar_url = excluded.avatar_url;

-- Listings belong to the screenshot account, making every request incoming.
insert into public.listings (
  id, seller_id, category, categories, title, description, price, negotiable,
  location, contact, photo_urls, photo_focus, created_at, archived
)
select v.id::uuid, u.id, v.category, array[v.category], v.title, v.description,
       v.price, true, v.location, '{email}', array[v.photo], '{50% 50%}', now() - v.age, false
from auth.users u
join screenshot_seed_config c on lower(u.email) = lower(c.viewer_email)
cross join (values
  ('a2200000-0000-4000-8000-000000000001', 'goods', 'Cream boucle accent chair',
   'Soft boucle chair in excellent condition. Pickup near USC Village.', 85, 'USC Village',
   'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=1200', interval '3 days'),
  ('a2200000-0000-4000-8000-000000000002', 'goods', 'Canon film camera',
   'Tested Canon film camera with strap and fresh batteries.', 120, 'Doheny Library',
   'https://images.unsplash.com/photo-1452780212940-6f5c0d14d848?w=1200', interval '2 days'),
  ('a2200000-0000-4000-8000-000000000003', 'services', 'Graduation portrait session',
   'One-hour campus portrait session with edited digital photos.', 95, 'Tommy Trojan',
   'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=1200', interval '1 day')
) as v(id, category, title, description, price, location, photo, age)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  price = excluded.price,
  photo_urls = excluded.photo_urls,
  archived = false,
  created_at = excluded.created_at;

insert into public.reveal_requests (
  id, listing_id, listing_title, buyer_id, seller_id, status, offer,
  intro_message, created_at, expires_at, resolved_at, seller_seen_at
)
select v.id::uuid, v.listing_id::uuid, l.title, v.buyer_id::uuid, l.seller_id,
       v.status, v.offer, v.intro, now() - v.age, now() + interval '60 hours',
       case when v.status = 'approved' then now() - v.age + interval '25 minutes' else null end,
       case when v.status = 'approved' then now() - v.age + interval '5 minutes' else null end
from (values
  ('a3300000-0000-4000-8000-000000000001', 'a2200000-0000-4000-8000-000000000001',
   'a1100000-0000-4000-8000-000000000001', 'pending', 75,
   'Hi! Is the chair still available? I can pick it up near the Village tomorrow afternoon.', interval '2 hours'),
  ('a3300000-0000-4000-8000-000000000002', 'a2200000-0000-4000-8000-000000000002',
   'a1100000-0000-4000-8000-000000000002', 'approved', 110,
   'I have been looking for a film camera. Would Saturday morning pickup work?', interval '1 day'),
  ('a3300000-0000-4000-8000-000000000003', 'a2200000-0000-4000-8000-000000000003',
   'a1100000-0000-4000-8000-000000000003', 'approved', 90,
   'I would love to book graduation portraits next week. Are golden-hour sessions available?', interval '7 hours')
) as v(id, listing_id, buyer_id, status, offer, intro, age)
join public.listings l on l.id = v.listing_id::uuid
on conflict (id) do update set
  status = excluded.status,
  offer = excluded.offer,
  intro_message = excluded.intro_message,
  created_at = excluded.created_at,
  expires_at = excluded.expires_at,
  resolved_at = excluded.resolved_at,
  seller_seen_at = excluded.seller_seen_at;

insert into public.message_threads (
  id, request_id, listing_id, listing_title, buyer_id, seller_id,
  created_at, last_message_at, seller_seen_at
)
select v.thread_id::uuid, r.id, r.listing_id, r.listing_title, r.buyer_id, r.seller_id,
       r.resolved_at, now() - v.last_age, now() - v.seen_age
from (values
  ('a4400000-0000-4000-8000-000000000001', 'a3300000-0000-4000-8000-000000000002', interval '35 minutes', interval '2 hours'),
  ('a4400000-0000-4000-8000-000000000002', 'a3300000-0000-4000-8000-000000000003', interval '12 minutes', interval '1 hour')
) as v(thread_id, request_id, last_age, seen_age)
join public.reveal_requests r on r.id = v.request_id::uuid
on conflict (request_id) do update set
  listing_title = excluded.listing_title,
  last_message_at = excluded.last_message_at,
  seller_seen_at = excluded.seller_seen_at;

delete from public.messages
where thread_id in (
  'a4400000-0000-4000-8000-000000000001'::uuid,
  'a4400000-0000-4000-8000-000000000002'::uuid
);

insert into public.messages (id, thread_id, sender_id, body, created_at)
select v.id::uuid, v.thread_id::uuid,
       case when v.from_buyer then t.buyer_id else t.seller_id end,
       v.body, now() - v.age
from (values
  ('a5500000-0000-4000-8000-000000000001', 'a4400000-0000-4000-8000-000000000001', true,
   'Thanks for approving! Would Saturday at 11 work?', interval '3 hours'),
  ('a5500000-0000-4000-8000-000000000002', 'a4400000-0000-4000-8000-000000000001', false,
   'Yes, I can meet outside Doheny at 11.', interval '2 hours'),
  ('a5500000-0000-4000-8000-000000000003', 'a4400000-0000-4000-8000-000000000001', true,
   'Perfect — see you then!', interval '35 minutes'),
  ('a5500000-0000-4000-8000-000000000004', 'a4400000-0000-4000-8000-000000000002', true,
   'Golden hour would be amazing. Is Tuesday open?', interval '50 minutes'),
  ('a5500000-0000-4000-8000-000000000005', 'a4400000-0000-4000-8000-000000000002', false,
   'Tuesday works! Let’s start at Tommy Trojan.', interval '12 minutes')
) as v(id, thread_id, from_buyer, body, age)
join public.message_threads t on t.id = v.thread_id::uuid;

commit;

-- Cleanup (run separately only when the screenshots are finished):
-- begin;
-- delete from public.reveal_requests where id::text like 'a3300000-%';
-- delete from public.listings where id::text like 'a2200000-%';
-- delete from public.profiles where id::text like 'a1100000-%';
-- commit;
