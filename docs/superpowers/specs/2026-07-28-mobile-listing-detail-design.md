# Mobile Listing Detail Screen — Design

**Date:** 2026-07-28
**Status:** Approved (design), pending implementation plan
**Context:** Sub-project 3 (marketplace screens), Screen 2, built after the Feed. Replaces the stub `mobile/src/app/(tabs)/listing/[id].tsx`. Backend RLS (019) live; feed screen done. Later screens: Posting, Profile, Reveals.

## Goal

Tap a feed card -> a full listing detail: photo carousel, title/price/description, map, seller, and a (deferred) reveal button. Displays directly from Supabase under RLS.

## Section 1 — Data & fetch

- Add `fetchListing(id: string): Promise<ListingDetail | null>` to `mobile/src/lib/listings.ts`.
  - Query 1: `from('listings').select('id, title, price, negotiable, description, category, location, photo_urls, lat, lng, place_name, event_start, event_end, seller_id').eq('id', id).maybeSingle()`.
  - Query 2 (if row found): `from('public_profiles').select('id, display_name, school_unit, class_year, avatar_url').eq('id', row.seller_id).maybeSingle()`.
  - Merge; return `null` if no row.
- Same RLS-safe pattern as the feed (seller via `public_profiles`, never base `profiles`).
- `ListingDetail` type extends the feed fields with `negotiable`, `description`, `category`, `lat`, `lng`, `place_name`, `event_start`, `event_end`.
- States on screen: loading (spinner), error (retry text), not-found ("Listing not found").

NOTE: verify the exact event-window column names against migration 017 during planning (may be `event_start`/`event_end` or similar); use the real names.

## Section 2 — UI

- **Photo carousel:** horizontal paged `FlatList` (pagingEnabled) through `photo_urls` with `expo-image`; dot indicators for position. Empty -> "No photo" tile.
- **Info block:** title, price label (`priceLabel`), a "Negotiable" tag when `negotiable`, category label, description text.
- **Map block:** if `lat != null && lng != null` -> Google Static Maps `<Image>` (URL uses `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`) + an "Open in Google Maps" row that `Linking.openURL('https://www.google.com/maps/search/?api=1&query=<lat>,<lng>')`. If no coords OR no key -> plain "Pickup at {place_name || location}" text line (graceful fallback).
- **Seller block:** avatar (expo-image; initials/placeholder fallback) + name · school_unit · class_year from `public_profiles`.
- **Reveal button:** "Reveal Contact" button, visible but **disabled with a 'coming soon' note**. The actual reveal SEND is deferred to a later sub-project (it's a server-side write — RLS blocks it from the client by design; it needs Bearer-token auth on `/api/reveals`). No write happens here.
- Brand: terse, no emoji, "flipd" styling; SVG/vector icons only.

## Section 3 — Deliverables & verification

1. `fetchListing(id)` + `ListingDetail` type in `mobile/src/lib/listings.ts`.
2. `mobile/src/app/(tabs)/listing/[id].tsx` — the real screen (replaces the stub).
3. Verification: `tsc` + `expo export` bundle on the builder side; the `fetchListing` query shape checked against the live schema (service-role, shape only); real device test in Expo Go by the user.

## Global constraints

- App is "Flipd", never "Tassel". No emojis. Terse.
- Direct-to-Supabase, anon key only; RLS governs. Seller via `public_profiles` only.
- Reveal is DISPLAY-ONLY this screen — no client-side reveal write (RLS-blocked by design).
- Map uses `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`; **the key's referrer/app restriction must permit Static Maps requests from the app** (mobile sends no HTTP referrer) — config item for the user; the screen falls back to text if the map fails/absent.
- `/mobile` stays isolated; web app unaffected.

## Out of scope

Actual reveal send (deferred), native interactive map (static image only), photo zoom/focus (`photo_zoom`/`photo_focus` — cover-fit only for now), edit/delete own listing, save/bookmark.
