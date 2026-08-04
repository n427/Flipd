# In-app messaging — implementation plan

Replaces contact reveal with in-app messaging. Phone and email stop being
things users hand to each other and become Flipd notification destinations.

Decisions locked with Nicole 2026-08-03. Nothing here is built yet.

## The model

Today: buyer requests contact, seller approves within 72h, both sides see each
other's phone/Instagram/email, conversation happens off-platform.

After: buyer sends a request **with a short intro message**, seller approves
within 72h, approval **opens a message thread inside Flipd**. Contact details
are never shared between users.

The 72h approve gate survives unchanged. Only the payoff changes, from contact
details to a thread. That keeps the Requests tab, the expiry job, the notify
events, and the ratings flow all intact.

## Why the intro message matters

A name and class year does not tell a seller whether this person actually wants
the sourdough. The intro message does three things at once:

1. Gives the seller something real to approve or decline on.
2. Front-loads logistics, so an approved thread starts at "can you do Tuesday"
   rather than at zero.
3. Makes services and food workable at all, where the seller needs to know what
   is being asked (tutoring in what subject, what time).

The buyer always opens the conversation. The seller is the passive party being
asked for something, so they respond by approving, declining, or replying.

## Contact-leak filter

Without this, buyers paste their number into the intro message and skip the
approval mechanic entirely, which removes the thing that makes Flipd different.

- Applies to the **intro message only**. Once approved, the two are connected
  and may legitimately need to swap numbers to meet up. Filtering there fights
  the user.
- On detection: **block send** with an inline message. Nothing is silently
  rewritten under the buyer.
  > Keep contact details out of your message. Chat opens once the seller approves.
- Runs on the server as the source of truth (`src/lib/validation.ts`), with the
  same function imported client-side for instant feedback. Never client-only.

Patterns to catch: phone numbers (including `two one three` style spellouts and
digits split by spaces/dots/dashes), emails, `@handle`, and bare mentions of
instagram / snap / snapchat / ig / venmo followed by a token.

Expect false positives (a listing about "call of duty", a price like
"213 dollars"). Bias toward letting an edge case through rather than blocking a
legitimate message: the filter is a speed bump against casual circumvention,
not airtight enforcement.

## Trust signals on the approve screen

Sellers currently decide on name, school, year, and a star rating. Additions:

- **The intro message** — the single biggest upgrade, context beats static data.
- **Completed swap count**, split buyer/seller: "6 completed swaps on Flipd".
  Derived live from `reveal_requests` where `status='completed'`, counting
  `buyer_id` and `seller_id` separately. No new columns, cannot drift.
- **"New to Flipd"** label when the count is zero, so an empty profile reads as
  a known state rather than a surprise.
- **Rating shown alongside the swap count, never alone.** "4.5 stars" from two
  reviews is noisy and misleads early on.
- **Profile photo**, for campus recognition.

Deliberately excluded: major, dorm, greek affiliation. They drift into
profiling that is not needed for a decision that is really "do I trust this
person for this exchange."

## Decline reasons

Optional, seller-picked, shown to the buyer: **bad timing**, **already sold**,
**not enough info**. Keeps the loop useful without making a decline feel
punitive. Nullable, declining without a reason stays a single tap.

## Notification preferences

Onboarding on both platforms gains a phone field and a multi-select of where
notifications go: **in-app**, **phone (SMS)**, **email**. Also editable later
from edit-profile on both platforms.

Phone and email are now notification destinations only. They are never shown to
another user.

`profiles.notify_prefs` is already `jsonb` (migration 009) and already keyed by
event. Extend the per-event value to carry channels rather than adding columns:

```jsonc
{ "new_request": { "app": true, "sms": false, "email": true } }
```

`app` is new; `email`/`sms` already exist in the shape the API validates.

## Schema

New migration `025_messaging.sql`:

```sql
-- One thread per approved reveal request.
create table public.message_threads (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique
    references public.reveal_requests (id) on delete cascade,
  listing_id uuid references public.listings (id) on delete set null,
  buyer_id uuid not null references public.profiles (id),
  seller_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  last_message_at timestamptz
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.message_threads (id) on delete cascade,
  sender_id uuid not null references public.profiles (id),
  -- Body may be empty when the message is a pure attachment, so the
  -- "not blank" rule moves to a table check across both columns.
  body text not null default '' check (length(body) <= 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

-- Photos and videos on a message. A message may carry several.
create table public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  -- Storage object path in the private message-attachments bucket. NOT a URL:
  -- clients receive short-lived signed URLs minted per request.
  storage_path text not null,
  kind text not null check (kind in ('image', 'video')),
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  width integer,
  height integer,
  duration_seconds numeric,
  created_at timestamptz not null default now()
);

create index attachments_message_idx on public.message_attachments (message_id);

create index messages_thread_idx on public.messages (thread_id, created_at desc);
create index threads_buyer_idx on public.message_threads (buyer_id, last_message_at desc);
create index threads_seller_idx on public.message_threads (seller_id, last_message_at desc);

-- Buyer's intro message + optional seller decline reason.
alter table public.reveal_requests
  add column if not exists intro_message text,
  add column if not exists decline_reason text
    check (decline_reason in ('bad_timing', 'already_sold', 'not_enough_info'));
```

RLS: a user may select/insert on a thread only if they are its `buyer_id` or
`seller_id`. Messages inherit through `thread_id`. Follow the patterns in
`019_rls_policies.sql`.

`request_id` is `unique`, so approving twice cannot fork a second thread.

## Attachments — photos and video

Built on Supabase Storage. No external service.

The upload stack already exists and works on both platforms: buckets with
per-user RLS (migration 021), `uploadListingPhotos` and `uploadAvatar` in
`mobile/src/lib/listings.ts`, `expo-image-picker` wired into `post.tsx`, and
`/api/me/avatar` handling both cookie and bearer auth. Adding Cloudinary or Mux
would mean a second vendor, a second credential set, and a second auth model to
reconcile against RLS, to duplicate what is already here. The one thing they
genuinely win at is video transcoding, which is avoidable at this scale by
capping length and size and playing the original.

**The attachments bucket is private.** This is the critical difference from
listing photos. `listing-photos` is `public: true`, correct for a feed. A
private conversation behind a public URL is readable by anyone who obtains the
link, so `message-attachments` is created with `public: false` and clients
receive **signed URLs minted per request**, expiring in about an hour, only
after the API confirms the caller is a participant in that thread.

`message_attachments.storage_path` therefore stores an object path, never a
URL. The signed URL is generated at read time and never persisted.

Limits, enforced server-side and mirrored in the client for fast feedback:

| | Limit |
|---|---|
| Images | 10 MB, jpeg / png / webp / heic |
| Video | 100 MB, up to 60 s, mp4 / quicktime |
| Per message | 10 attachments |

Client-side downscaling before upload keeps most photos well under the cap.
`expo-image-picker` already returns compressed output at `quality: 0.8`; video
uses the picker's native duration cap so a too-long clip is rejected before it
uploads rather than after.

Playback uses `expo-video` on mobile and a plain `<video>` element on web. No
transcoding: whatever the device recorded is what plays back, which is
reliable across iOS and Android for mp4/quicktime and avoids a processing
pipeline entirely.

**Schema caveat.** "A message must have a body or an attachment" cannot be a
check constraint, since Postgres forbids subqueries there. Enforced instead in
the API route, which is the only writer, with the `messages_not_empty` rule
covered by tests rather than by the database.

## Cross-linking, FBMP style

Everything connects: request to chat to post, in both directions.

- **Listing detail to thread.** If the viewer already has a thread on this
  listing, the primary action becomes **Open chat** instead of Request. Seller
  side shows the thread count. Removes the dead end where a buyer with an
  approved request lands on the post with no way back into the conversation.
- **Thread to listing.** A pinned listing header at the top of every thread:
  photo, title, price, status. Tapping opens the post. Persists as the thread
  scrolls, so the subject is never ambiguous.
- **Request to thread.** On approval the Requests row switches its action to
  **Open chat**. Approving navigates straight into the new thread rather than
  leaving the seller to find it.
- **Thread to request context.** The thread header carries the original intro
  message and the approval date, so the origin stays visible.
- **Archived and deleted listings.** `listing_id` is `on delete set null`, so a
  thread outlives its post. The header then shows the denormalized title with a
  "listing removed" note, matching how `reveal_requests.listing_title` already
  survives deletion.

## Realtime

Supabase Realtime on `messages`, filtered by `thread_id`. Already available on
the project, works in both Next.js and Expo, no new infrastructure.

Subscribe on thread open, unsubscribe on close. Fall back to refetch-on-focus
so a dropped socket degrades to the polling behavior rather than a dead screen.

## Phases

Each phase ends green (typecheck + build + lint) and is independently
reviewable.

**1. Schema + validation**
`025_messaging.sql` including `message_attachments`; the private
`message-attachments` bucket and its storage RLS;
`containsContactInfo()` in `src/lib/validation.ts` with unit tests in the
existing `validation.test.ts`; attachment type/size validators; swap-count
helper.

**2. API**
`POST /api/reveals` accepts `intro_message`, rejects on filter hit (422).
`PATCH /api/reveals/[id]` creates the thread on approve, records
`decline_reason` on decline. New `/api/threads` and `/api/threads/[id]/messages`,
the latter minting signed attachment URLs for participants only.
`/api/threads/[id]/attachments` for upload. `/api/users/[id]` returns swap
counts. Stop returning contact fields in every reveal payload.

**3. Web**
Intro-message field on the reveal modal with live filter feedback. Approve card
shows intro, swap counts, "New to Flipd", rating, photo. Decline reason picker.
Thread view with pinned listing header, attachment picker, image/video
rendering, lightbox. Listing detail gains Open chat when a thread exists.
`ContactLinks` removed from the reveal path.

**4. Mobile**
Same as phase 3 against the Expo screens: `listing/[id]`, `requests.tsx`, new
thread screen. Attachments via `expo-image-picker` (images and video), playback
via `expo-video`. `ContactBlock` removed.

**5. Onboarding + prefs**
Phone field and channel multi-select on both `src/app/onboarding` and
`mobile/(onboarding)/setup.tsx`, plus both edit-profile screens.

**6. Legal + seed**
Rewrite the reveal/meetup and "what other users can see" sections in
`src/lib/legal.ts`, mirror to mobile, **no em dashes**. Extend
`dev_popup_request.sql` with threads and messages.

## Consequences worth naming

- **Users will resist at first.** Off-platform contact is the habit. The intro
  message and a fast thread need to feel better than "just text me."
- **Notification reliability becomes load-bearing.** Today a missed
  notification costs a delayed reply; after this it costs the conversation,
  since there is no fallback channel. SMS via a provider is not wired up yet;
  phase 5 stores the preference, and actually sending SMS is follow-on work.
- **`contact_instagram` goes unused.** Kept in the schema per your call, read
  by nothing. Worth dropping in a later migration once this settles.
- **Moderation surface, now larger.** Flipd hosts not just user text but user
  photos and video. Report/block should extend to threads and individual
  attachments, and there is no scanning for illegal or abusive imagery. Not in
  this plan, and the single biggest thing to resolve before this is public.
- **Storage cost and growth.** Attachments accumulate with no expiry. A
  retention rule (drop attachments on threads idle past some window) is worth
  adding before this sees real volume, not after.
- **Signed URLs expire.** A thread left open for hours will have stale
  attachment URLs. The client refetches on focus and on playback error rather
  than assuming a URL stays valid.
- **The filter will annoy someone.** A legitimate message will get blocked. The
  copy explains why, and the rule is intro-only so the blast radius is one
  field.
