# Mobile Posting — Phase A: Storage RLS + Upload Plumbing — Design

**Date:** 2026-07-28
**Status:** Approved (design), pending implementation plan
**Context:** Sub-project 3 (marketplace screens), Screen 3 (Posting), Phase A of 2. Posting lets a signed-in user create a listing from their phone. Phase A is the **foundation**: Storage RLS so the mobile client can upload photos directly, plus the upload helper. Phase B (the form UI + row insert) follows and depends on this.

## Goal

Let the authenticated mobile client upload listing photos directly to Supabase Storage (currently anon-write is RLS-blocked), scoped so a user can only write in their own folder. Provide a tested `uploadListingPhotos()` helper.

## Background (verified)

- The `listing-photos` bucket exists and is `public: true` (reads public). **Anon/client uploads are RLS-blocked** — the web app uploads server-side with the service-role key. Confirmed live: an anon upload returns "new row violates row-level security policy".
- The `listings` row INSERT is already allowed for the mobile client by the `019` policy `listings_insert_own` (`with check seller_id = auth.uid()`), so Phase B's row write needs no new policy — only photo upload does.

## Section 1 — Storage RLS (migration 021, GATED)

Add Storage policies on `storage.objects` for the `listing-photos` bucket:

- **INSERT (upload):** allow `authenticated` when `bucket_id = 'listing-photos'` AND the first path segment equals the user's id — `(storage.foldername(name))[1] = auth.uid()::text`. This confines each user to their own `listing-photos/{uid}/...` folder (standard Supabase Storage ownership pattern).
- **UPDATE/DELETE (own objects):** same predicate, so a user can replace/remove only their own uploads (`owner = auth.uid()` OR the folder check; use the folder check for consistency).
- **SELECT:** not needed as a policy — the bucket is `public: true`, so public URLs read without auth.

Tested on isolated local Postgres (throwaway DB, never the unrelated dyrt-app DB): assert an authenticated user can insert an object under their own uid folder, cannot insert under another uid's folder. Production apply is **GATED** on explicit user approval (like 019/020).

NOTE: `storage.objects` / `storage.foldername` exist only in a real Supabase/Postgres with the storage schema. The isolated test builds a minimal `storage.objects(bucket_id text, name text, owner uuid)` skeleton + a `storage.foldername(text)` stub returning `string[]` to validate the policy predicate logic. The true end-to-end (real Storage upload) is verified on-device in Phase B.

## Section 2 — Upload helper

Add to `mobile/src/lib/listings.ts`:

- `uploadListingPhotos(localUris: string[], userId: string): Promise<string[]>`
  - For each local URI (from expo-image-picker): read the file, upload to `listing-photos/{userId}/{unique}.jpg` via `supabase.storage.from('listing-photos').upload(path, data, { contentType, upsert: false })`.
  - React Native upload: convert the local file URI to an `ArrayBuffer`/`Blob` (RN `fetch(uri).then(r => r.arrayBuffer())` or the `FileSystem`/`base64` approach). Use the approach that works with `supabase-js` in RN (arrayBuffer is the reliable path).
  - Collect each object's public URL via `getPublicUrl(path)`; return the array in order.
  - On any upload error, throw (Phase B surfaces it).
- A unique filename per photo (index + timestamp passed in, since `Math.random`/`Date.now` are fine at runtime in the app — this is app code, not a workflow script).

## Deliverables

1. `supabase/migrations/021_storage_listing_photos.sql` — Storage RLS policies (INSERT/UPDATE/DELETE own folder).
2. `supabase/tests/021_storage_listing_photos.test.sql` — isolated predicate test.
3. `uploadListingPhotos()` in `mobile/src/lib/listings.ts`.

## Global constraints

- App is "Flipd", never "Tassel". No emojis. Terse.
- Direct-to-Supabase, anon/authenticated key only; RLS/Storage-RLS governs.
- Upload path is always `listing-photos/{auth.uid()}/...` — users can only write their own folder.
- Migration 021 tested on isolated Postgres; production apply GATED on explicit approval.
- Verification: SQL predicate test (isolated) + `tsc` for the helper; real Storage upload proven on-device in Phase B.
- `/mobile` isolated; web app unaffected (web keeps using service-role uploads).

## Out of scope (Phase B and beyond)

The posting form UI, image picker, category/location pickers, `createListing()` row insert, navigation after submit, image compression/resizing.
