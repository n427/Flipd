# Mobile Feed Screen — Design

**Date:** 2026-07-28
**Status:** Approved (design), pending implementation plan
**Context:** Sub-project 3 of 3 (the marketplace screens), built screen-by-screen. This is **Screen 1: the Feed** — the first real screen, replacing the "Feed — coming soon" placeholder in the `/mobile` Expo app. Backend RLS (019) and USC trigger (020) exist; the app scaffold + auth (sub-project 2) is done. Later screens (Listing Detail, Posting, Profile, Reveals) are separate specs.

## Goal

A scrollable feed of active listings on the phone, pulled live from Supabase (direct, RLS-governed), matching the web feed's content. Tapping a card navigates toward Listing Detail (stub route for now).

## Section 1 — Data fetching under RLS

The web feed reads server-side with the service-role key and joins the seller profile freely. Mobile reads **direct** with the authenticated anon key, so RLS shapes what's possible. Two verified constraints:

1. **Signed-in only.** `listings_read_active` is `for select to authenticated`, so the feed must be inside the auth-gated tab group (it is). An anonymous/no-session read returns 0 rows — correct and secure.
2. **Seller info is NOT available via a `listings -> profiles` embedded join.** `profiles` has no broad SELECT policy (only own-row), so PostgREST embedding returns null for the seller. Seller public fields (display_name, school_unit, class_year, avatar_url) come from the **`public_profiles`** view (SECURITY DEFINER, safe columns only).

**Fetch approach — two RLS-safe queries merged client-side (chosen: option A):**
- Query 1: `from('listings').select(<columns>).eq('archived', false).order('created_at', {ascending:false}).limit(50)`.
- Query 2: `from('public_profiles').select('id, display_name, school_unit, class_year, avatar_url').in('id', <distinct seller_ids>)`.
- Merge in JS: attach each listing's seller from a `Map<seller_id, publicProfile>`.
- No new migration needed. (Rejected option B: a pre-joined DB view — cleaner queries but another gated prod migration; revisit if pagination/perf needs it.)

## Section 2 — Feed screen UI & behavior

**Layout (native; terse, no emoji, matching web feed spirit):**
- 2-column grid via `FlatList numColumns={2}` (native virtualization for a long feed).
- Card: listing photo (first `photo_urls[0]`), title, price label ("$40" / "Free"), meta line (seller first name · school_unit · class_year, falling back to pickup location). Tap -> navigate to `/(tabs)/listing/[id]` (stub for now).
- Header: "flipd" wordmark. (Search deferred.)

**States (all real):**
- Loading: spinner while the two queries run.
- Empty: "No listings yet".
- Error: "Couldn't load — pull to retry".
- Pull-to-refresh: native `RefreshControl` reloads.

**Images:** `expo-image` `<Image>` for remote URLs + caching. Broken/missing photo -> neutral placeholder tile (mirrors web `ImageWithFallback`; no broken-image glyph).

**Data plumbing:** `mobile/src/lib/listings.ts` exports `fetchFeed(): Promise<FeedListing[]>` running the two queries + merge. The screen consumes it; query logic stays testable and out of the component. Also exports the `FeedListing` type and a `priceLabel(price)` helper (mirrors web: `price>0 ? '$'+toLocaleString : 'Free'`).

**Pagination:** initial version loads most-recent ~50 (one page). Infinite scroll deferred (YAGNI).

## Deliverables

1. `mobile/src/lib/listings.ts` — `FeedListing` type, `fetchFeed()`, `priceLabel()`.
2. `mobile/src/app/(tabs)/feed.tsx` — the grid screen with all states + pull-to-refresh, replacing the placeholder.
3. A listing-card component (`mobile/src/components/ListingCard.tsx`) — photo + placeholder fallback, title, price, meta; tappable.
4. A stub `mobile/src/app/(tabs)/listing/[id].tsx` route so card taps navigate somewhere (real detail is a later screen).
5. Unit test for `priceLabel()` (pure).

## Global constraints

- App is "Flipd", never "Tassel". No emojis; icons via `@expo/vector-icons` or none. Terse.
- Direct-to-Supabase with the anon key only; RLS governs access. No service-role on device.
- Seller info via `public_profiles` only (never the base `profiles` table).
- Verification: `tsc` + `expo export` bundle on the builder side; real device test in Expo Go by the user (needs sign-in + real listings).
- The web app and its deploys stay unaffected (`/mobile` isolated).

## Out of scope (later screens)

Real Listing Detail (photos gallery, map, reveal button), Posting (image picker + map), Profile, Reveals/Requests, search/filter, infinite-scroll pagination, saves/bookmarks.
