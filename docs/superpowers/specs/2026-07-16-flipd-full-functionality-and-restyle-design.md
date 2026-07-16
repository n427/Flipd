# Flipd — Full Functionality, Database, and Restyle

**Date:** 2026-07-16
**Status:** Approved by user (all four sections)

## Summary

Take Flipd from a mostly-mocked demo to a fully functional, database-backed campus
marketplace, and restyle both the app and the marketing site. Brand facts: the product
is **Flipd** (never "Tassel" in UI), typography is **Inter everywhere**, and **no emojis**
anywhere — SVG/line icons only.

Chosen directions (validated via visual mockups):
- **App:** "A1 clean market" — white ground, near-black type, gray metadata, cardinal
  `#990000` reserved for prices/CTAs/wordmark dot, dense photo-first 2-column grid
  (more columns at desktop widths), rounded tiles, subtle hover lift. No serif.
- **Marketing site:** "P1 pure Apple" — frosted-glass sticky nav, centered giant-type
  hero, app visual rising into view with drifting listing cards, scroll-reveal sections,
  cardinal used only for the eyebrow line and primary CTA.

## Architecture decision

**Server API routes + RLS backstop** (user-selected over browser-direct Supabase).
The existing Next.js API route pattern stays and is extended. Routes authenticate the
caller from the Supabase session cookie, perform writes with the service-role client,
and enforce ownership checks in code. Row Level Security is enabled on every table as a
safety net so the public anon key alone can do nothing harmful (fixes the current
critical advisory: RLS disabled on `listings` and `saves`).

## 1. Database & auth

### Auth flow
- Supabase Auth **magic-link (email OTP)** sign-in.
- A server route (e.g. `POST /api/auth/signin`) validates the address ends in
  `@usc.edu` (case-insensitive) before calling `signInWithOtp`; non-USC addresses get a
  clear error. The landing-page CTA form submits here — the old fake waitlist form
  becomes the real entry point.
- `@supabase/ssr` browser/server clients + Next.js middleware keep the session cookie
  fresh. All `(app)` routes (`/feed`, `/post`, `/profile`, `/listing/[id]`) require a
  session; unauthenticated visitors are redirected to `/` (landing).
- First sign-in with no profile row → onboarding screen (name, handle, school unit,
  class year, contact methods) → then feed.

### Schema (migrations via Supabase MCP)
- `profiles`
  - `id uuid PK` = `auth.users.id`
  - `display_name text`, `handle text unique`, `school_unit text`, `class_year text`
  - `contact_instagram text`, `contact_phone text`, `contact_email text` (nullable)
  - `is_demo boolean default false`, `created_at timestamptz default now()`
  - Row auto-created on first sign-in (trigger on `auth.users` insert), completed
    during onboarding.
- `listings` (existing table, altered)
  - `seller_id` becomes `uuid` FK → `profiles.id` (drop the `'user_alex_park'` default).
  - Existing columns kept: category, title, description, price, negotiable, location,
    contact (text[] of chosen methods), photo_urls, photo_focus, archived, created_at.
- `saves` (altered)
  - Composite PK `(user_id uuid FK → profiles.id, listing_id uuid FK → listings.id)`,
    `created_at`.
- `reveal_requests` (new)
  - `id uuid PK`, `listing_id` FK, `buyer_id` FK → profiles, `seller_id` FK → profiles,
    `status text` in (`pending`,`approved`,`declined`,`expired`), `created_at`,
    `expires_at timestamptz` (= created_at + 72h), `resolved_at timestamptz null`.
  - Unique on `(listing_id, buyer_id)` where status in (pending, approved) to prevent
    duplicate requests.
  - **Expiry is computed at read time** (pending AND now > expires_at → treated/updated
    as expired when fetched). No cron.
- **RLS** enabled on all four tables. Policies mirror API behavior: anyone
  authenticated can read active listings and profiles' public fields; owners write
  their own rows; reveal_requests readable/writable only by their buyer or seller.
  (API routes use service role and enforce the same rules in code.)

### Honest stats & seed data
- The fake "47 sales" counters are removed. Seller identity shows real data only:
  name, unit, class year, active-listings count, member-since.
- Seed: one demo profile ("Flipd Team", `is_demo = true`, fixed UUID, inserted with
  service role — not a real auth user) owning ~12 listings adapted from the current
  mock set. Placeholder photos are hotlinked seeded-picsum URLs stored directly in
  `photo_urls` (no bucket upload needed). Easy to delete later by `is_demo` flag.

### Existing storage
- `listing-photos` public bucket stays as the photo store; upload path unchanged
  (server-side, sanitized keys).

## 2. App functionality

- **Feed:** all users' active listings, newest first; search, category chips,
  price filter, sort — same client behavior as today, but seller names/units come from
  a `profiles` join. Demo listings appear like any other.
- **Reveal Contact (fully real):**
  - Buyer taps Reveal on a listing → `POST /api/reveals` creates a pending request
    (blocked on own listings and duplicates).
  - Button reflects state: Reveal → Requested (pending) → contact shown (approved) /
    Declined / Expired.
  - Seller sees incoming requests in Activity with buyer name/unit/year and
    Approve / Decline actions (`PATCH /api/reveals/[id]`).
  - On approval, buyer's Activity entry exposes the seller's contact info: the
    listing's `contact` array names which methods the seller offers for that listing;
    the actual values (handle/phone/email) come from the seller's profile. All offered
    methods are shown.
  - 72h expiry computed on read.
- **Activity tab:** two directions (incoming = requests on my listings, outgoing = my
  requests). Badge count = pending incoming, refreshed by polling (~30s) and on
  navigation. Replaces `DEFAULT_ACTIVITY` mock entirely.
- **Saves:** per-user (user_id from session); optimistic toggle kept.
- **Post flow:** unchanged mechanics (photos, focal points, reorder, AI description via
  existing Anthropic route), now stamped with the real `seller_id`.
- **Archive/restore:** kept; server verifies ownership.
- **Profile:** real user's info + editable profile fields + sign out. My/Past listings
  from DB (already real, now per-user).
- **store.ts:** `CURRENT_USER`, `MY_SEED`, `DEFAULT_ACTIVITY`, and `MOCK_LISTINGS`
  usage removed; store hydrates from `/api/me`, `/api/listings`, `/api/saves`,
  `/api/reveals`.

## 3. App restyle — "A1 clean market"

- `globals.css` rewritten: Inter (Google Fonts or next/font), token set —
  `--bg: #fff`, `--ink: #111`, `--ink-2: #333`, `--muted: #98a0a8`,
  `--surface: #f2f3f5`, `--accent: #990000`, radii 10–12px, soft small shadows.
  Serif and cream/gold editorial tokens removed.
- Feed screen: `flipd` lowercase bold wordmark + cardinal dot, search field
  (`Search Flipd`), pill chip row (active = near-black fill), dense photo grid
  (2 cols mobile, 3–4 desktop): rounded photo, bold near-black price, one-line title,
  gray meta (location · seller, unit 'YY).
- Listing detail, post flow, activity, profile, onboarding, sign-in: same token
  system; cardinal only for primary actions and prices; line-icon set (existing
  `Icon.tsx`, extended as needed); no emojis anywhere.
- Motion: card hover lift + shadow, quick fade/slide page transitions, badge pulse on
  new activity. Subtle — the app stays utilitarian.

## 4. Marketing site — "P1 pure Apple"

Rebuild `Landing.tsx` (Inter, white):
- **Nav:** frosted-glass sticky bar — lowercase `flipd` wordmark, links (Browse, How it
  works, Trust, Sellers), near-black "Sign in" pill.
- **Hero:** centered — small cardinal eyebrow ("The marketplace for USC."), giant
  tight-tracked headline ("Buy from people who show up."), gray subhead, cardinal
  "Get started" pill + "See what's listed ›" text link. Below, an app-feed mockup
  rises into view with two real listing cards drifting beside it (CSS keyframes:
  staggered fade-up, rise-in, gentle drift loops).
- **Sections** (each scroll-revealed via IntersectionObserver): How it works (3 steps,
  clean numbered cards), Categories (5 minimal tiles, line icons), Trust (verification
  stats, real copy, no fake testimonial numbers), final CTA.
- **Final CTA / sign-in:** email field + button → real magic-link flow (`/api/auth/signin`);
  success state = "check your email"; non-USC address = inline error. Signed-in
  visitors' CTAs route straight to `/feed`; logged-out "Browse"/"See what's listed"
  CTAs scroll to the sign-in CTA (the feed itself requires a session).
- **Footer:** minimal single-row; Terms/Privacy/Contact links dropped for now (no
  fake links to nowhere).
- Old editorial components (serif hero, quote block, gold accents) deleted.

## Error handling

- API routes: 401 without session, 403 on ownership violations, 400 on validation
  (missing title/photos, bad email domain), descriptive JSON errors surfaced by the
  existing store error paths.
- Magic-link failures and non-USC emails show inline form errors on the landing page.
- Reveal actions are idempotent-safe (duplicate request → 409 handled as "already
  requested" in UI).

## Testing / verification

- TypeScript build (`next build`) stays green.
- Manual end-to-end verify: sign in with magic link → onboarding → post a listing →
  second account saves it and requests reveal → first account approves → contact
  visible → archive listing. RLS verified by attempting reads/writes with the bare
  anon key (should fail for writes).
- Supabase advisors re-run after migrations (RLS advisory must clear).

## Out of scope

Chat/messaging, payments, email/push notifications, multi-school support, native
mobile apps, moderation tooling.
