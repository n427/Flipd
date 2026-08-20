-- Campus reseed: wipe every listing, then repopulate the feed from eight
-- student sellers with bios, avatars, two posts each, and real reviews.
--
--   psql "$DATABASE_URL" -f supabase/seeds/campus_reseed.sql
--   -- or paste the whole file into the Supabase SQL editor
--
-- Run by hand. NOT a migration -- it lives outside supabase/migrations so it
-- never auto-applies, because step one deletes every row in public.listings.
--
-- Plain SQL only: no psql backslash commands (\set etc), because the Supabase
-- SQL editor talks straight to the server and would reject them. That is why
-- the fixed UUIDs below are written out in full rather than aliased.
--
-- Safe to re-run: everything is keyed off fixed UUIDs and upserted, so a second
-- run refreshes the rows (and all the timestamps) instead of duplicating.
--
--   a1000000-...-0001 ... -0008   the eight seller profiles
--   a2000000-...-0001 ... -0016   their listings, two per seller
--   a3000000-...-0001 ... -0019   completed transactions behind the reviews
--   a4000000-...-0001 ... -0019   the reviews themselves
--
-- WHAT THE WIPE TAKES
--   Only listings. Profiles are untouched, so real accounts still sign in.
--   reveal_requests survive the delete with listing_id set to null and their
--   snapshotted listing_title (008_requests_survive_delete.sql), so real users
--   keep their request history and their ratings. Saves and popup reminders are
--   bookmarks pointing at listings that no longer exist, so they go.
--
-- NO POPUPS
--   A popup is just a listing with category 'event' plus an event window (see
--   isPopup / 017_popup_events.sql). Nothing here uses that category, so no
--   popup pill, countdown, or reminder appears anywhere. Categories are limited
--   to goods / services / housing; 'food' is retired from the postable set
--   (src/lib/types.ts).
--
-- IMAGES
--   Photo URLs are built from the storage base below, so uploading a file to
--   the named path is all that is needed -- no editing this file. Upload the
--   eight avatars to the `avatars` bucket under seed/, and the sixteen post
--   photos to the `listing-photos` bucket under seed/. Both buckets are public.
--   Every expected path is listed at the bottom of this file.

begin;

-- ── 1. WIPE ──────────────────────────────────────────────────────────
-- Saves first: that table predates the migrations, so its FK to listings is
-- not in version control and may not cascade. Deleting explicitly makes the
-- listings delete below succeed either way. popup_reminders does cascade, but
-- clearing it here keeps the order obvious.
delete from public.saves;
delete from public.popup_reminders;
delete from public.listings;

-- ── 2. SELLERS ───────────────────────────────────────────────────────
-- is_demo stays false: these read as ordinary students everywhere in the UI.
-- Cleanup therefore relies on the fixed UUIDs above, not on the demo flag.
--
-- Handles are set explicitly rather than left to the profiles_set_handle
-- trigger. The trigger only fills a null handle (030_auto_handle.sql), so an
-- explicit one always wins and these /u/ URLs stay stable across re-runs.
--
-- school_unit and class_year come from the onboarding option lists (UNITS /
-- YEARS in mobile/src/app/(onboarding)/setup.tsx) so no profile renders a value
-- the app's own pickers could not have produced.
--
-- created_at is backdated by months: an account age of "joined 2 years ago"
-- is what makes a senior with 30 completed swaps believable.
insert into public.profiles (
  id, display_name, handle, school_unit, class_year, bio, avatar_url,
  contact_method, contact_instagram, contact_email, is_demo, created_at
)
select v.id::uuid, v.display_name, v.handle, v.unit, v.year, v.bio,
       'https://csjbfnbjwtvmtsudxukj.supabase.co/storage/v1/object/public/avatars/seed/'
         || v.handle || '.jpg',
       v.method, v.instagram, v.email, false, now() - v.age
from (values
  ('a1000000-0000-4000-8000-000000000001', 'Maya Okonkwo', 'maya.okonkwo', 'Roski', 'Junior',
   'Printmaking major at Roski. I run small risograph editions out of Watt and take on a couple of commissions a month.',
   'instagram', 'maya.prints', 'mokonkwo@usc.edu', interval '14 months'),
  ('a1000000-0000-4000-8000-000000000002', 'Diego Herrera', 'diego.herrera', 'Viterbi', 'Senior',
   'Mechanical engineering senior. I fix bikes in the courtyard most weekends and I am clearing out my apartment before May.',
   'email', null, 'dherrera@usc.edu', interval '31 months'),
  ('a1000000-0000-4000-8000-000000000003', 'Priya Raman', 'priya.raman', 'Marshall', 'Sophomore',
   'Sophomore at Marshall. I thrift far more than I can wear, so most of it ends up here. Everything is washed and measured before I post it.',
   'instagram', 'priya.thrifts', 'praman@usc.edu', interval '9 months'),
  ('a1000000-0000-4000-8000-000000000004', 'Jules Kim', 'jules.kim', 'SCA', 'Grad',
   'Production grad student at SCA. Selling camera gear I have outgrown, and shooting grad photos through cap and gown season.',
   'instagram', 'juleskimfilm', 'jkim@usc.edu', interval '19 months'),
  ('a1000000-0000-4000-8000-000000000005', 'Tasha Bright', 'tasha.bright', 'Annenberg', 'Junior',
   'Comm junior, two internships deep into recruiting. I have rewritten my own resume enough times to be genuinely useful at it.',
   'email', null, 'tbright@usc.edu', interval '16 months'),
  ('a1000000-0000-4000-8000-000000000006', 'Omar Haddad', 'omar.haddad', 'Price', 'Senior',
   'Price senior graduating in May. Subletting my place for the summer and selling everything that will not fit in the car.',
   'email', null, 'ohaddad@usc.edu', interval '33 months'),
  ('a1000000-0000-4000-8000-000000000007', 'Lena Vasquez', 'lena.vasquez', 'Thornton', 'Freshman',
   'Freshman at Thornton, classical guitar. Teaching beginners on weekends and selling the keyboard I learned on.',
   'instagram', 'lena.plays', 'lvasquez@usc.edu', interval '5 months'),
  ('a1000000-0000-4000-8000-000000000008', 'Sam Whitfield', 'sam.whitfield', 'Dornsife', 'Sophomore',
   'Pre-med sophomore at Dornsife. Took the MCAT early and did well, so I tutor the sections I know cold.',
   'email', null, 'swhitfield@usc.edu', interval '11 months')
) as v(id, display_name, handle, unit, year, bio, method, instagram, email, age)
on conflict (id) do update set
  display_name      = excluded.display_name,
  handle            = excluded.handle,
  school_unit       = excluded.school_unit,
  class_year        = excluded.class_year,
  bio               = excluded.bio,
  avatar_url        = excluded.avatar_url,
  contact_method    = excluded.contact_method,
  contact_instagram = excluded.contact_instagram,
  contact_email     = excluded.contact_email,
  is_demo           = false;

-- ── 3. LISTINGS ──────────────────────────────────────────────────────
-- Two per seller, one photo each. photo_focus and photo_zoom are single-element
-- arrays because their contract is "index matches photo_urls"
-- (018_photo_zoom.sql) -- a shorter array would leave the crop undefined if a
-- second photo were ever appended.
--
-- `categories` is left to its '{}' default and `category` carries the value:
-- 014_multi_category.sql keeps the singular column as the read-time fallback,
-- and none of these are genuinely cross-category.
--
-- `contact` mirrors each seller's contact_method, so the methods a listing
-- offers are ones the profile actually has a value for -- resolveSharedContact
-- intersects the two and would silently share nothing otherwise.
--
-- Ages are staggered across twelve days so the recency sort has something to
-- do. Anything carrying a review is at least four days old, so a completed
-- transaction behind it is plausible; the Icon Plaza sublet is the one
-- brand-new post and deliberately has no reviews yet.
insert into public.listings (
  id, seller_id, category, title, description, price, negotiable,
  location, contact, photo_urls, photo_focus, photo_zoom, archived, created_at
)
select v.id::uuid, v.seller_id::uuid, v.category, v.title, v.description,
       v.price, v.negotiable, v.location, v.contact::text[],
       array['https://csjbfnbjwtvmtsudxukj.supabase.co/storage/v1/object/public/listing-photos/seed/'
         || v.photo || '.jpg'],
       '{50% 50%}', '{1}', false, now() - v.age
from (values
  -- Maya Okonkwo -- Roski
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
   'goods', 'Risograph prints, campus series',
   'Hand-pulled riso prints of Doheny, Bovard and the rose garden. Two color, A3, printed on cream stock. Signed on the back.',
   18, false, 'Watt Hall', '{instagram}', 'riso-prints', interval '9 days'),
  ('a2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001',
   'services', 'Custom portrait, ink on paper',
   'Ink portrait drawn from a photo you send me. A4, about a week turnaround. Good for birthdays and graduation gifts.',
   45, true, 'Watt Hall', '{instagram}', 'ink-portrait', interval '6 days'),
  -- Diego Herrera -- Viterbi
  ('a2000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000002',
   'goods', 'Standing desk and monitor arm',
   'Electric sit-stand desk, 48 inch top, plus a dual monitor arm. Everything works, a couple of scuffs on the legs. You will need a car.',
   140, true, 'Cardinal Gardens', '{email}', 'standing-desk', interval '11 days'),
  ('a2000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000002',
   'services', 'Bike tune-up, flat rate',
   'Brakes, gears, chain clean and I true the wheels. I bring my own stand and work outside your building. About forty minutes.',
   25, false, 'Adams & Vermont', '{email}', 'bike-tuneup', interval '8 days'),
  -- Priya Raman -- Marshall
  ('a2000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000003',
   'goods', 'Levi''s 501s, 27 waist',
   'Thrifted mid-wash 501s, no rips or stains. Measured flat: 14 inch waist, 29 inch inseam. Washed and ready to go.',
   32, true, 'USC Village', '{instagram}', 'levis-501', interval '4 days'),
  ('a2000000-0000-4000-8000-000000000006', 'a1000000-0000-4000-8000-000000000003',
   'goods', 'Doc Martens 1460, women''s 8',
   'Classic black 1460s, broken in but plenty of sole left. Some creasing across the toe, shown in the photo. Spare laces included.',
   75, true, 'USC Village', '{instagram}', 'doc-martens', interval '7 days'),
  -- Jules Kim -- SCA
  ('a2000000-0000-4000-8000-000000000007', 'a1000000-0000-4000-8000-000000000004',
   'goods', 'Canon 50mm f/1.8, barely used',
   'Nifty fifty, no scratches on the glass, autofocus is quiet and quick. Caps and a UV filter included. Happy to let you test it first.',
   95, false, 'Zemeckis Center', '{instagram}', 'canon-50mm', interval '10 days'),
  ('a2000000-0000-4000-8000-000000000008', 'a1000000-0000-4000-8000-000000000004',
   'services', 'Grad photos, one hour on campus',
   'Cap and gown session anywhere on campus. Roughly forty edited shots back within a week, delivered as a download.',
   130, true, 'On campus', '{instagram}', 'grad-photos', interval '7 days'),
  -- Tasha Bright -- Annenberg
  ('a2000000-0000-4000-8000-000000000009', 'a1000000-0000-4000-8000-000000000005',
   'goods', 'COMM 300 and 302 textbooks',
   'Both books, current editions. Some highlighting in the first four chapters of 300, otherwise clean. Selling as a pair.',
   40, true, 'Annenberg (ASC)', '{email}', 'comm-textbooks', interval '12 days'),
  ('a2000000-0000-4000-8000-000000000010', 'a1000000-0000-4000-8000-000000000005',
   'services', 'Resume and cover letter edit',
   'Line edits plus comments on structure, back within 24 hours. I have been through Marshall and Annenberg recruiting, so I know the format they expect.',
   30, false, 'Zoom', '{email}', 'resume-edit', interval '5 days'),
  -- Omar Haddad -- Price
  ('a2000000-0000-4000-8000-000000000011', 'a1000000-0000-4000-8000-000000000006',
   'housing', 'Summer sublet, 1bd at Icon Plaza',
   'June 1 to August 15, furnished one bedroom, utilities and wifi included. Pool, gym and study rooms. Parking available for extra.',
   1350, true, 'Icon Plaza', '{email}', 'icon-sublet', interval '1 day'),
  ('a2000000-0000-4000-8000-000000000012', 'a1000000-0000-4000-8000-000000000006',
   'goods', 'Move-out: couch, rug and floor lamp',
   'Two seater couch, 5x7 rug and a floor lamp. Taking the lot for 120, or make me an offer on pieces. Must go before the 30th.',
   120, true, 'Icon Plaza', '{email}', 'moveout-couch', interval '6 days'),
  -- Lena Vasquez -- Thornton
  ('a2000000-0000-4000-8000-000000000013', 'a1000000-0000-4000-8000-000000000007',
   'services', 'Guitar lessons, beginner friendly',
   'Half hour lessons, classical or acoustic. I have a spare guitar you can borrow for the first few weeks. Weekends work best.',
   35, false, 'Thornton (TMC)', '{instagram}', 'guitar-lessons', interval '9 days'),
  ('a2000000-0000-4000-8000-000000000014', 'a1000000-0000-4000-8000-000000000007',
   'goods', 'Yamaha P-45 keyboard and stand',
   '88 weighted keys, the keyboard I learned on. Comes with the X stand, sustain pedal and power supply. Everything works.',
   290, true, 'Fluor Tower', '{instagram}', 'yamaha-p45', interval '5 days'),
  -- Sam Whitfield -- Dornsife
  ('a2000000-0000-4000-8000-000000000015', 'a1000000-0000-4000-8000-000000000008',
   'services', 'MCAT tutoring, 517 scorer',
   'One on one, mostly CARS and bio-biochem. We work through your own practice tests rather than a set curriculum. Doheny or Zoom.',
   55, true, 'Doheny Library', '{email}', 'mcat-tutoring', interval '11 days'),
  ('a2000000-0000-4000-8000-000000000016', 'a1000000-0000-4000-8000-000000000008',
   'goods', 'Single-speed bike, 54cm',
   'Rides smooth, new tires and brake pads this spring. Some cosmetic scratches on the frame. Comes with the lock.',
   165, true, 'North University Park', '{email}', 'single-speed-bike', interval '8 days')
) as v(id, seller_id, category, title, description, price, negotiable,
       location, contact, photo, age)
on conflict (id) do update set
  seller_id   = excluded.seller_id,
  category    = excluded.category,
  title       = excluded.title,
  description = excluded.description,
  price       = excluded.price,
  negotiable  = excluded.negotiable,
  location    = excluded.location,
  contact     = excluded.contact,
  photo_urls  = excluded.photo_urls,
  created_at  = excluded.created_at,
  archived    = false;

-- ── 4. COMPLETED TRANSACTIONS ────────────────────────────────────────
-- A review is not a standalone row: public.ratings requires a request_id
-- pointing at a completed reveal_request, and the API only accepts a rating
-- from one of that request's two parties (src/app/api/ratings/route.ts). So
-- every review below needs a finished transaction underneath it.
--
-- The eight sellers buy from each other, which keeps the whole graph inside
-- this seed -- no real account is implicated in a transaction that never
-- happened. It also gives each profile a non-zero completed-swap count on both
-- sides, which is what fetchSwapCounts reads for the trust signals.
--
-- reveal_requests_live_uniq only constrains pending/approved rows, so several
-- completed requests against the same listing are fine.
--
-- Each request's age is smaller than its listing's, resolved_at lands six hours
-- later, and the rating a day after that -- so nothing is bought before it was
-- posted or reviewed before it was resolved.
insert into public.reveal_requests (
  id, listing_id, listing_title, buyer_id, seller_id,
  status, offer, intro_message, created_at, expires_at, resolved_at
)
select v.id::uuid, l.id, l.title, v.buyer_id::uuid, l.seller_id,
       'completed', v.offer, v.intro,
       now() - v.age, now() - v.age + interval '72 hours',
       now() - v.age + interval '6 hours'
from (values
  -- reviews for Maya
  ('a3000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001',
   'a1000000-0000-4000-8000-000000000003', 18,
   'Are the Doheny ones still available? I would take two if you have them.', interval '7 days'),
  ('a3000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002',
   'a1000000-0000-4000-8000-000000000008', 45,
   'Looking to commission one as a birthday gift, is two weeks enough notice?', interval '5 days'),
  ('a3000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000001',
   'a1000000-0000-4000-8000-000000000005', 18,
   'Would love the rose garden print if it is still around. I am usually near Watt on Tuesdays.', interval '4 days'),
  -- reviews for Diego
  ('a3000000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000004',
   'a1000000-0000-4000-8000-000000000006', 25,
   'My gears keep slipping on the way up to campus. Any chance you are free this weekend?', interval '6 days'),
  ('a3000000-0000-4000-8000-000000000005', 'a2000000-0000-4000-8000-000000000004',
   'a1000000-0000-4000-8000-000000000007', 25,
   'My brakes are really soft and I do not trust them downhill. Could you take a look?', interval '3 days'),
  ('a3000000-0000-4000-8000-000000000006', 'a2000000-0000-4000-8000-000000000003',
   'a1000000-0000-4000-8000-000000000004', 130,
   'Setting up an edit bay at home and this looks perfect. I can borrow a car Saturday.', interval '9 days'),
  -- reviews for Priya
  ('a3000000-0000-4000-8000-000000000007', 'a2000000-0000-4000-8000-000000000005',
   'a1000000-0000-4000-8000-000000000001', 32,
   'Those measurements sound like exactly my size. Are they still available?', interval '3 days'),
  ('a3000000-0000-4000-8000-000000000008', 'a2000000-0000-4000-8000-000000000006',
   'a1000000-0000-4000-8000-000000000007', 65,
   'How worn are the soles? I would want to wear them daily so just checking before I commit.', interval '5 days'),
  -- reviews for Jules
  ('a3000000-0000-4000-8000-000000000009', 'a2000000-0000-4000-8000-000000000007',
   'a1000000-0000-4000-8000-000000000002', 95,
   'Is the mount Canon EF? I have an older body and want to be sure it fits before I come by.', interval '8 days'),
  ('a3000000-0000-4000-8000-000000000010', 'a2000000-0000-4000-8000-000000000008',
   'a1000000-0000-4000-8000-000000000005', 130,
   'Graduating in May and would love to book a session. Do you have weekend slots left?', interval '6 days'),
  -- reviews for Tasha
  ('a3000000-0000-4000-8000-000000000011', 'a2000000-0000-4000-8000-000000000010',
   'a1000000-0000-4000-8000-000000000008', 30,
   'Applying to a research program with a deadline Friday. Is a 24 hour turnaround still doable?', interval '4 days'),
  ('a3000000-0000-4000-8000-000000000012', 'a2000000-0000-4000-8000-000000000009',
   'a1000000-0000-4000-8000-000000000003', 35,
   'Taking both classes next semester. Would you do 35 for the pair?', interval '10 days'),
  ('a3000000-0000-4000-8000-000000000013', 'a2000000-0000-4000-8000-000000000010',
   'a1000000-0000-4000-8000-000000000006', 30,
   'Need a second pair of eyes on my consulting resume before applications open.', interval '2 days'),
  -- review for Omar
  ('a3000000-0000-4000-8000-000000000014', 'a2000000-0000-4000-8000-000000000012',
   'a1000000-0000-4000-8000-000000000004', 100,
   'Interested in the couch and the rug. Would you take 100 for the two of them?', interval '4 days'),
  -- reviews for Lena
  ('a3000000-0000-4000-8000-000000000015', 'a2000000-0000-4000-8000-000000000013',
   'a1000000-0000-4000-8000-000000000001', 35,
   'Total beginner, never held a guitar. Is that too far back to start?', interval '7 days'),
  ('a3000000-0000-4000-8000-000000000016', 'a2000000-0000-4000-8000-000000000014',
   'a1000000-0000-4000-8000-000000000008', 275,
   'Does it come with the pedal? Looking for a first piano and this seems ideal.', interval '4 days'),
  -- reviews for Sam
  ('a3000000-0000-4000-8000-000000000017', 'a2000000-0000-4000-8000-000000000015',
   'a1000000-0000-4000-8000-000000000005', 55,
   'CARS is destroying me and I test in eight weeks. Do you have regular slots?', interval '9 days'),
  ('a3000000-0000-4000-8000-000000000018', 'a2000000-0000-4000-8000-000000000016',
   'a1000000-0000-4000-8000-000000000002', 150,
   'Is the frame steel or aluminum? I am about 5 foot 10 so 54 should be close.', interval '6 days'),
  ('a3000000-0000-4000-8000-000000000019', 'a2000000-0000-4000-8000-000000000015',
   'a1000000-0000-4000-8000-000000000003', 55,
   'Mostly need help with bio-biochem rather than CARS. Is that something you cover?', interval '5 days')
) as v(id, listing_id, buyer_id, offer, intro, age)
join public.listings l on l.id = v.listing_id::uuid
on conflict (id) do update set
  listing_id    = excluded.listing_id,
  listing_title = excluded.listing_title,
  buyer_id      = excluded.buyer_id,
  seller_id     = excluded.seller_id,
  status        = 'completed',
  offer         = excluded.offer,
  intro_message = excluded.intro_message,
  created_at    = excluded.created_at,
  expires_at    = excluded.expires_at,
  resolved_at   = excluded.resolved_at;

-- ── 5. REVIEWS ───────────────────────────────────────────────────────
-- The buyer rates the seller, matching the direction the API enforces: rater is
-- a party to the request, ratee is the other one. Both ids are derived from the
-- request rather than repeated here, so they cannot drift out of sync with it.
--
-- Ratings are anonymous in every read path, so the rater's identity never
-- surfaces -- it exists only to satisfy the unique (request_id, rater_id).
--
-- Scores skew 4 and 5 but the counts deliberately do not match: Omar has one
-- review and Diego has three, so the profiles do not all read as uniformly
-- seeded. Two are star-only with no text, which the reviews list renders on
-- purpose (see the comment in src/app/api/ratings/route.ts).
insert into public.ratings (id, request_id, rater_id, ratee_id, score, text, created_at)
select v.id::uuid, r.id, r.buyer_id, r.seller_id, v.score, v.text,
       r.resolved_at + interval '1 day'
from (values
  ('a4000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 5,
   'Prints came exactly as pictured and she threw in a smaller one. Easy pickup at Watt.'),
  ('a4000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000002', 5,
   'Commissioned a portrait for my mom''s birthday. Took about a week and it looked better than the samples.'),
  ('a4000000-0000-4000-8000-000000000003', 'a3000000-0000-4000-8000-000000000003', 4,
   'Really nice print, though it took a few days of messaging to line up a pickup time.'),
  ('a4000000-0000-4000-8000-000000000004', 'a3000000-0000-4000-8000-000000000004', 5,
   'Fixed my derailleur in twenty minutes and showed me what he was doing. Cheaper than any shop near campus.'),
  ('a4000000-0000-4000-8000-000000000005', 'a3000000-0000-4000-8000-000000000005', 5,
   'My brakes were genuinely unsafe and now they are perfect. He met me right outside my building.'),
  ('a4000000-0000-4000-8000-000000000006', 'a3000000-0000-4000-8000-000000000006', 5,
   'Desk was in better shape than described and he helped me carry it down three flights.'),
  ('a4000000-0000-4000-8000-000000000007', 'a3000000-0000-4000-8000-000000000007', 5,
   'Measurements were spot on, which basically never happens buying jeans secondhand.'),
  ('a4000000-0000-4000-8000-000000000008', 'a3000000-0000-4000-8000-000000000008', 4,
   'Boots were a bit more worn than the photos suggested, but she was upfront when I asked and took ten off.'),
  ('a4000000-0000-4000-8000-000000000009', 'a3000000-0000-4000-8000-000000000009', 5,
   'Glass was clean, no haze, and he let me test it on my own body before I paid.'),
  ('a4000000-0000-4000-8000-000000000010', 'a3000000-0000-4000-8000-000000000010', 5,
   'Shot my grad photos around Doheny and had them back in four days. Far better than the official ones.'),
  ('a4000000-0000-4000-8000-000000000011', 'a3000000-0000-4000-8000-000000000011', 5,
   'Turned my resume around overnight with real comments, not just formatting notes.'),
  ('a4000000-0000-4000-8000-000000000012', 'a3000000-0000-4000-8000-000000000012', 4,
   'Both books had some highlighting but she said so in the post, so no surprises. Fine for the price.'),
  ('a4000000-0000-4000-8000-000000000013', 'a3000000-0000-4000-8000-000000000013', 5, null),
  ('a4000000-0000-4000-8000-000000000014', 'a3000000-0000-4000-8000-000000000014', 4,
   'Couch was solid and the price was fair. Move-out day was hectic so pickup ran a couple of hours late.'),
  ('a4000000-0000-4000-8000-000000000015', 'a3000000-0000-4000-8000-000000000015', 5,
   'Endlessly patient with an absolute beginner. I could play two songs after three lessons.'),
  ('a4000000-0000-4000-8000-000000000016', 'a3000000-0000-4000-8000-000000000016', 5,
   'Keyboard works perfectly and came with the stand and pedal as promised. Great first piano.'),
  ('a4000000-0000-4000-8000-000000000017', 'a3000000-0000-4000-8000-000000000017', 5,
   'Spent two hours on CARS strategy with me and my next practice score jumped six points.'),
  ('a4000000-0000-4000-8000-000000000018', 'a3000000-0000-4000-8000-000000000018', 5,
   'Bike rode great and he had just put new tires on it. Met me at the park to hand it over.'),
  ('a4000000-0000-4000-8000-000000000019', 'a3000000-0000-4000-8000-000000000019', 4, null)
) as v(id, request_id, score, text)
join public.reveal_requests r on r.id = v.request_id::uuid
on conflict (id) do update set
  request_id = excluded.request_id,
  rater_id   = excluded.rater_id,
  ratee_id   = excluded.ratee_id,
  score      = excluded.score,
  text       = excluded.text,
  created_at = excluded.created_at;

commit;

-- ── IMAGES TO UPLOAD ─────────────────────────────────────────────────
-- Bucket `avatars`, path seed/<file>          -- 8 files, square, face visible
--   maya.okonkwo.jpg      diego.herrera.jpg   priya.raman.jpg     jules.kim.jpg
--   tasha.bright.jpg      omar.haddad.jpg     lena.vasquez.jpg    sam.whitfield.jpg
--
-- Bucket `listing-photos`, path seed/<file>   -- 16 files, one per post
--   riso-prints.jpg        art prints laid out on a desk
--   ink-portrait.jpg       an ink portrait, or the artist drawing one
--   standing-desk.jpg      a standing desk with a monitor arm
--   bike-tuneup.jpg        a bike upside down or in a repair stand
--   levis-501.jpg          folded blue jeans, flat lay
--   doc-martens.jpg        a pair of black boots
--   canon-50mm.jpg         a camera lens on a plain surface
--   grad-photos.jpg        a student in cap and gown on campus
--   comm-textbooks.jpg     two textbooks stacked
--   resume-edit.jpg        a laptop showing a resume, or marked-up pages
--   icon-sublet.jpg        a furnished bedroom or apartment interior
--   moveout-couch.jpg      a couch with a rug, in an apartment
--   guitar-lessons.jpg     an acoustic guitar, or someone teaching
--   yamaha-p45.jpg         a digital keyboard on its stand
--   mcat-tutoring.jpg      study notes and a laptop on a library desk
--   single-speed-bike.jpg  a bike against a wall or rack
--
-- What landed:
--   select count(*) from public.listings;                    -- 16
--   select display_name, handle, school_unit, class_year, avatar_url
--     from public.profiles where id::text like 'a1000000%' order by handle;
--   select p.display_name, count(*) as reviews, round(avg(r.score), 2) as stars
--     from public.ratings r
--     join public.profiles p on p.id = r.ratee_id
--     where r.id::text like 'a4000000%'
--     group by p.display_name order by stars desc;
--   select category, count(*) from public.listings group by category;
--   select count(*) from public.listings where category = 'event';   -- 0, no popups
