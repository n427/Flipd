# Mobile Profile Screen — Design

**Date:** 2026-07-28
**Status:** Approved (design), pending implementation plan
**Context:** Sub-project 3, Screen 4 (Profile). Replaces the placeholder Profile tab (currently email + sign out). Feed, Detail, Posting done. Scope for this pass: header + own listings + sign out (Saved/Activity/Reviews/edit deferred).

## Goal

The Profile tab shows the signed-in user's identity (avatar, name, unit/year, bio) and a grid of their own listings, plus sign out. All reads direct from Supabase under RLS.

## Section 1 — Data

Add to `mobile/src/lib/listings.ts` (or a new module; keep in listings.ts for cohesion):

- `type MyProfile = { id; display_name; school_unit; class_year; bio; avatar_url }` (all nullable except id).
- `fetchMyProfile(userId: string): Promise<MyProfile | null>` — `from('profiles').select('id, display_name, school_unit, class_year, bio, avatar_url').eq('id', userId).maybeSingle()`. The `profiles_select_own` RLS policy allows reading one's OWN row (including private-ish fields); this is the user's own id so it's allowed.
- `fetchMyListings(userId: string): Promise<FeedListing[]>` — `from('listings').select('id, title, price, location, photo_urls, seller_id').eq('seller_id', userId).order('created_at', {ascending:false})`. RLS `listings_select_own_archived` allows own listings (active + archived). Seller is the user themselves; attach a minimal `FeedSeller` built from the profile (no extra query needed), or leave `seller: null` since the card falls back to the location line. Keep it simple: `seller: null` (card shows location meta) — the header already shows identity.

## Section 2 — UI (rewrite `mobile/src/app/(tabs)/profile.tsx`)

- **Header:** avatar (`expo-image`, grey circle fallback), display name, "school_unit · class_year" line, bio (if present).
- **My Listings:** section title + 2-column grid of the user's listings via `ListingCard`; tap -> `/(tabs)/listing/[id]`. Empty: "You haven't posted anything yet."
- **Sign out:** button calling `supabase.auth.signOut()` (keep existing behavior).
- **States:** loading spinner while fetching; error line if a query fails. Terse; no emoji.

## Section 3 — Deliverables & verification

1. `MyProfile` type + `fetchMyProfile()` + `fetchMyListings()` in `mobile/src/lib/listings.ts`.
2. Rewritten `mobile/src/app/(tabs)/profile.tsx` (header + grid + sign out).
3. Verification: `tsc` + `expo export`; `fetchMyProfile`/`fetchMyListings` column shapes vs live schema (service-role, shape only); device test in Expo Go.

## Global constraints

- App is "Flipd", never "Tassel". No emojis. Terse.
- Direct-to-Supabase; own profile via `profiles_select_own`, own listings via `listings_select_own_archived`.
- Reuse `ListingCard` (feed) and `FeedListing`; do not duplicate a card.
- `/mobile` isolated; web unaffected.

## Out of scope

Saved listings tab, Activity/Reviews, editing the profile (name/bio/contacts), avatar upload, other users' public profiles (that's the `public_profiles` path already used by feed/detail).
