# Map-Based Location Picker — Design

**Date:** 2026-07-19
**Status:** Approved (design), pending implementation plan

## Summary

Today a listing's location is a single free-text field (`listings.location`) with quick-pick campus chips, surfaced app-side as `meta`. There is no map, no coordinates, no geo dependency or API key anywhere in the repo.

This feature adds a **map-based location picker** to the posting form (search a place OR drop a pin; the pin reverse-geocodes to autofill the place name, e.g. "Trader Joe's") and a **map display** on the listing detail page (a static map with the pin + an "Open in Google Maps" link). It is **additive and optional**: listings without coordinates fall back to today's plain-text behavior.

## Provider decision

**Google Maps JavaScript API + Places** (Autocomplete + reverse geocoding), plus **Google Static Maps** for the detail-page image.

- One env key: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (client-exposed; restrict by HTTP referrer in Google Cloud console).
- **The user must create the Google Cloud API key with billing enabled.** Claude cannot provision it. The feature is non-functional until the key is set; the form degrades gracefully to plain text without it.
- Google chosen for best POI/storefront naming ("Trader Joe's" reliably) and native "Open in Google Maps" links. Usage stays within the free tier at student-app scale (Places/JS only on the post form; one static-image request per detail view).

## Section 1 — Data model

Migration `016_listing_coordinates.sql` adds to `public.listings`:
- `lat double precision` (nullable)
- `lng double precision` (nullable)
- `place_name text` (nullable) — the human label ("Trader Joe's")

The existing `location text` column **stays** and keeps holding the display string (so old listings and the `meta` mapping in `mapDbListing` keep working unchanged). When a map location is set, `location` is set to `place_name` too. Lat/lng are nullable: old listings have none; chip/text-only entries may have none. **Null lat/lng → no map** (plain-text fallback).

## Section 2 — Posting form location picker

A new `<LocationPicker>` component replaces the chips + text input at `src/components/WebApp.tsx:1274-1287`:

- **Search box** — Google Places Autocomplete, biased to the USC area so nearby places surface first. Selecting a result drops the pin + fills `placeName`, `lat`, `lng`.
- **Interactive map** — centered on USC by default, draggable pin. Drag/tap → reverse-geocode → autofill `placeName`. The autofilled name sits in an editable text field below the map (seller can correct a generic result).
- **Quick-pick chips retained** — the ~6 campus spots become shortcuts: tapping one drops the pin at that spot's pre-stored (hardcoded) coordinates and fills the map. (`MEETUP_SPOTS` in `WebApp.tsx:16` gains coordinates.)
- **State:** form gains `lat`, `lng`, `placeName` alongside existing `location`. On submit, `fd.append`s all three; `location` is set to `placeName` so the existing text path stays intact.
- **Validation:** location stays required, satisfied by EITHER a map pin (lat/lng + name) OR a typed name. A seller who types a name without a pin can still post (no map, plain text). One validation surface (per brand UX restraint).
- **Graceful degradation:** if the Google script fails to load (missing key, offline), the component falls back to the current chips + text input so posting never breaks.

## Section 3 — API, detail page, testing

**API** (`src/app/api/listings/route.ts` POST + `src/app/api/listings/[id]/route.ts` PATCH):
- Parse `lat`, `lng`, `place_name` from form data. Validate lat/lng are finite numbers in range (lat `-90..90`, lng `-180..180`); if either missing or invalid, store BOTH as `null` (never partial coordinates). `place_name` trimmed or null. **Invalid coordinates never reject the post** — they degrade to null (no map); the `location` text still persists, so the listing remains valid. Location's required-ness is enforced on the `location` text (as today), not on coordinates.
- Persist into the new columns. `location` continues to be set as today.
- Types: extend `Listing` (`src/lib/types.ts:33`), the DB-row type + `mapDbListing` (`src/lib/store.ts:28`, `:97`), and `NewListingInput` (`src/lib/types.ts:95`) to carry `lat`/`lng`/`placeName`.

**Detail page** (`src/components/WebApp.tsx:622-631`, the "Pickup at …" block):
- Has lat/lng → embedded **Google Static Maps** image with the pin, place name above it, and an **"Open in Google Maps"** link (`https://www.google.com/maps/search/?api=1&query=<lat>,<lng>`).
- No coordinates → unchanged plain-text "Pickup at {location}".

**Testing:**
- Unit (Vitest, pure, in `src/lib/validation.ts` or a new pure module): coordinate parse/validate helper — valid pair, out-of-range, one missing, non-numeric → null. Campus-spot → coordinates lookup.
- End-to-end: post by dropping a pin (place name autofills) → submit → detail page shows static map + working "Open in Google Maps" link. Verify text-only fallback (no pin) still posts and renders plain text. Verify no-API-key fallback renders the chips+text form.

## Global constraints (from brand/UX rules)

- App is "Flipd", never "Tassel". No emojis; SVG `<Icon>` only.
- No wizards, no stacked delight, terse labels, ONE validation surface per form.
- `src/lib/validation.ts` stays dependency-free (pure unit-test surface) — coordinate helper goes there or in a sibling pure module.
- Reuse existing style classes (`field`, `field-label`, chip styles). No new styling system.
- Google Maps script loaded lazily (post form + detail only), never app-wide.

## Out of scope (YAGNI)

- Live interactive map on the detail page (static image only — cheaper, lighter).
- Distance/proximity search or "listings near me".
- Storing multiple locations per listing.
- Approximate/rounded coordinates (decision: exact pin — it's a chosen meetup spot, not a home address).
- Provider abstraction layer (Google only; revisit if a second provider is ever needed).
