# Mobile Posting — Phase B: The Form — Design

**Date:** 2026-07-28
**Status:** Approved (design), pending implementation plan
**Context:** Sub-project 3, Screen 3 (Posting), Phase B of 2. Phase A (Storage RLS migration 021 + `uploadListingPhotos()`) is built. This phase is the form UI + the row insert, turning the Post tab placeholder into a working create-listing flow.

## Goal

The Post tab becomes a real form; submitting uploads photos (via Phase A) and inserts a listing row directly (RLS `listings_insert_own` allows it), then navigates to the new listing.

## Section 1 — Form UI (replaces `mobile/src/app/(tabs)/post.tsx`)

- **Photos:** `expo-image-picker` — "Add photos" offering photo library OR camera (permissions requested on demand), up to 8. Horizontal thumbnail strip with a remove (×) per photo. Local URIs held in state until submit.
- **Title:** required text input.
- **Price:** numeric input; empty or 0 -> "Free".
- **Description:** multiline, optional.
- **Category:** required single-select chips — Services / Food / Housing / Goods / Popups. IDs: `services, food, housing, goods, event` (event = Popups). A small local `CATEGORIES` constant in mobile (copied, like `usc.ts`), excluding the web `all` filter.
- **Negotiable:** toggle (Switch).
- **Location:** text field for the spot name + 3 campus quick-pick chips (USC Village / Leavey Library / Tutor Campus Center) with preset lat/lng; tapping a chip fills name + coords. Free text = name only, no coords. Reuse the 3 `CAMPUS_SPOTS` values (copied into mobile).
- Terse; no emoji; SVG/vector icons only.

## Section 2 — Submit flow

- **Validation (one surface):** require title, category, and a location name. Photos optional (text-only listing allowed). A single error line.
- **On submit:**
  1. `setSubmitting(true)`.
  2. If photos: `photo_urls = await uploadListingPhotos(localUris, session.user.id)`; else `[]`.
  3. `await createListing({...})` inserting the row with `seller_id = session.user.id`.
  4. On success: navigate to `/(tabs)/listing/{newId}` (or back to Feed), reset the form.
  5. On error: show the message (covers upload failure and the RLS error if migration 021 isn't applied yet), `setSubmitting(false)`.
- **`createListing()`** in `mobile/src/lib/listings.ts`:
  - `insert` into `listings` with `{ seller_id, title, price, description, category, location, place_name, lat, lng, negotiable, photo_urls }` and `.select('id').single()`, returning the new id.
  - `seller_id` MUST be `session.user.id` (RLS `with check seller_id = auth.uid()`).
  - `price` parsed to integer (0 if empty).

## Section 3 — Deliverables & verification

1. `createListing(input: NewListing): Promise<string>` + `NewListing` type in `mobile/src/lib/listings.ts`.
2. `mobile/src/lib/catalog.ts` — local `CATEGORIES` (5) + `CAMPUS_SPOTS` (3) copied from web to keep mobile self-contained.
3. `mobile/src/app/(tabs)/post.tsx` — the form (replaces placeholder). Uses `useSession()` for the user id.
4. Add dep: `expo-image-picker`.
5. Verification: `tsc` + `expo export`; `createListing` insert-shape checked against the live schema (service-role, shape only); the full photo -> upload -> insert loop proven on-device (needs migrations 020+021 applied + a real photo + sign-in).

## Global constraints

- App is "Flipd", never "Tassel". No emojis. Terse. One validation surface.
- Direct-to-Supabase, anon/authenticated key only. `seller_id = session.user.id` always (RLS enforces).
- Photos upload only to `listing-photos/{uid}/` (Phase A). Needs migration 021 applied to actually succeed; the form surfaces the RLS error otherwise.
- Category ids exactly `services, food, housing, goods, event`. Campus chips exactly USC Village / Leavey Library / Tutor Campus Center with their preset coords.
- `/mobile` isolated; web app unaffected.

## Out of scope

Editing/deleting a listing, image compression/resizing, the full map pin picker (chips + text only), multi-category selection (single category), draft saving, photo reordering.
