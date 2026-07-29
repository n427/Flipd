-- Signup attribution. Captured once during onboarding, never edited after —
-- this describes the moment a user arrived, not the user, so letting people
-- revise it later would rewrite acquisition history. Null means "unanswered",
-- which is the honest value for everyone who signed up before this shipped.

-- Stable snake_case IDs, not display labels, so UI copy can be reworded without
-- breaking analytics continuity. This list must stay in sync with HEARD_FROM in
-- src/app/api/me/route.ts and CHANNELS in src/app/onboarding/page.tsx — a
-- mismatch means the UI offers a value this constraint rejects.
alter table public.profiles add column heard_from text
  check (heard_from in ('instagram', 'friend', 'flyer', 'class_club', 'other'));

-- Optional free-text follow-up: which friend, which class or club.
-- Only collected for channels where a detail is meaningful.
alter table public.profiles add column heard_from_detail text;
