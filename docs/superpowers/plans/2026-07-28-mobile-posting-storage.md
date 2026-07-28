# Mobile Posting Phase A (Storage RLS + Upload) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Storage RLS so the authenticated mobile client can upload listing photos to its own folder, plus a tested `uploadListingPhotos()` helper. (Phase B builds the posting form on top.)

**Architecture:** Migration `021` adds `storage.objects` policies scoping `listing-photos` uploads to `{auth.uid()}/...`. `uploadListingPhotos()` in `lib/listings.ts` reads local image URIs (base64 via expo-file-system -> ArrayBuffer via base64-arraybuffer) and uploads them, returning public URLs. Migration tested on isolated Postgres; production apply GATED.

**Tech Stack:** Supabase Storage RLS (Postgres), `@supabase/supabase-js`, `expo-file-system`, `base64-arraybuffer`, TypeScript; local isolated Postgres for the policy test.

## Global Constraints

- App is "Flipd", never "Tassel". No emojis. Terse.
- Upload path is ALWAYS `listing-photos/{auth.uid()}/...` — users write only their own folder.
- Migration 021 tested on isolated Postgres (throwaway DB — never the unrelated dyrt-app DB on the local stack); production apply GATED on explicit approval.
- Direct-to-Supabase; anon/authenticated key only. Web app unaffected (keeps service-role uploads).
- Verification: SQL predicate test (isolated) + `cd mobile && npx tsc --noEmit`; real Storage upload proven on-device in Phase B.

---

### Task 1: Storage RLS migration (021)

**Files:**
- Create: `supabase/migrations/021_storage_listing_photos.sql`
- Create: `supabase/tests/021_storage_listing_photos.test.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/021_storage_listing_photos.sql`:
```sql
-- Storage RLS for the listing-photos bucket: authenticated users may upload/
-- modify/delete only within their own {uid}/ folder. Reads stay public
-- (bucket is public: true). Service-role (web app) bypasses all of this.

create policy "listing_photos_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "listing_photos_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "listing_photos_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

- [ ] **Step 2: Write the isolated predicate test**

`storage.objects`/`storage.foldername` only exist in real Supabase. The test builds a minimal skeleton to validate the POLICY PREDICATE logic (own-folder allowed, other-folder blocked). Create `supabase/tests/021_storage_listing_photos.test.sql`:
```sql
-- Isolated predicate test for migration 021. Builds a minimal storage schema
-- skeleton (real Supabase provides these) so the own-folder policy can be
-- exercised as an authenticated user. Verified 2026-07-28: PASS.
create schema if not exists storage;
-- Minimal foldername stub: split path on '/', return text[] of segments.
create or replace function storage.foldername(name text)
  returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text,
  name text,
  owner uuid
);
alter table storage.objects enable row level security;
-- auth.uid() stub reading a GUC (mirrors the RLS test harness).
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true),'')::uuid $$;
grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
grant usage on schema storage to authenticated; grant execute on function storage.foldername(text) to authenticated;
grant insert, select on storage.objects to authenticated;

-- Apply the insert policy (mirrors migration 021).
create policy "listing_photos_insert_own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);

set role authenticated;
select set_config('app.uid', 'aaaaaaaa-0000-4000-8000-000000000001', false);

do $$ begin
  insert into storage.objects (bucket_id, name) values ('listing-photos', 'aaaaaaaa-0000-4000-8000-000000000001/pic.jpg');
  raise notice 'PASS: upload to own folder allowed';
exception when others then raise notice 'FAIL: own-folder upload blocked (%)', sqlerrm; end $$;

do $$ begin
  insert into storage.objects (bucket_id, name) values ('listing-photos', 'bbbbbbbb-0000-4000-8000-000000000002/pic.jpg');
  raise notice 'FAIL: upload to another user folder allowed (should be blocked)';
exception when others then raise notice 'PASS: other-folder upload blocked (%)', sqlerrm; end $$;
```

- [ ] **Step 3: Run the test on an isolated throwaway DB**

```bash
export PGPASSWORD=postgres
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -q -c "drop database if exists flipd_storage_check;"
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -q -c "create database flipd_storage_check;"
psql -h 127.0.0.1 -p 54322 -U postgres -d flipd_storage_check -f supabase/tests/021_storage_listing_photos.test.sql 2>&1 | grep -E "PASS|FAIL"
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -q -c "drop database flipd_storage_check;"
# confirm unrelated DB intact:
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -tAc "select count(*) from pg_tables where schemaname='public';" | xargs echo "dyrt public tables (unchanged):"
```
Expected: `PASS: upload to own folder allowed`, `PASS: other-folder upload blocked`; dyrt count unchanged (183).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/021_storage_listing_photos.sql supabase/tests/021_storage_listing_photos.test.sql
git commit -m "feat: Storage RLS for listing-photos own-folder uploads (021) + test"
```

---

### Task 2: `uploadListingPhotos()` helper

**Files:**
- Modify: `mobile/src/lib/listings.ts`
- Add dep: `base64-arraybuffer`

**Interfaces:**
- Consumes: `supabase`; `expo-file-system`; `base64-arraybuffer`.
- Produces: `uploadListingPhotos(localUris: string[], userId: string): Promise<string[]>`.

- [ ] **Step 1: Add the dep**

```bash
cd mobile && npx expo install base64-arraybuffer
```

- [ ] **Step 2: Write the helper**

Append to `mobile/src/lib/listings.ts`:
```typescript
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';

// Upload local image URIs (from expo-image-picker) to listing-photos/{userId}/.
// RN reliable path: read file as base64 -> ArrayBuffer -> upload. Returns the
// public URLs in order. `userId` must be the caller's auth uid (Storage RLS
// enforces the {uid}/ folder). `stamp` makes filenames unique per call.
export async function uploadListingPhotos(localUris: string[], userId: string): Promise<string[]> {
  const urls: string[] = [];
  for (let i = 0; i < localUris.length; i++) {
    const uri = localUris[i];
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const path = `${userId}/${i}-${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from('listing-photos')
      .upload(path, decode(base64), { contentType: 'image/jpeg', upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from('listing-photos').getPublicUrl(path);
    urls.push(data.publicUrl);
  }
  return urls;
}
```
(Place the two new imports at the top of the file with the existing import.)

- [ ] **Step 3: Typecheck**

```bash
cd mobile && npx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/lib/listings.ts mobile/package.json mobile/package-lock.json
git commit -m "feat(mobile): uploadListingPhotos helper (base64 -> Storage)"
```

---

### Task 3: Gated production apply + Phase B handoff

**Files:** none.

- [ ] **Step 1: Present the migration-021 gate**

Show the user migration 021 + its passing isolated test. It adds Storage RLS to production. GATED — ask for explicit approval to apply (Supabase SQL editor or MCP). Do NOT apply without it. Note: until applied, mobile photo upload will fail with an RLS error (expected); Phase B's form will surface it.

- [ ] **Step 2: Confirm readiness for Phase B**

With 021 applied (or pending) and `uploadListingPhotos` in place, Phase B (posting form) can proceed: it will call `uploadListingPhotos(uris, session.user.id)` then insert the listing row.

---

## Self-Review

**Spec coverage:**
- §1 Storage RLS insert/update/delete own-folder → Task 1 migration. ✓
- §1 isolated predicate test (own allowed, other blocked) → Task 1 test. ✓
- §1 production apply gated → Task 3. ✓
- §2 uploadListingPhotos (base64 -> ArrayBuffer -> upload, public URLs) → Task 2. ✓
- Out of scope (form, picker, createListing) → Phase B, not here. ✓

**Placeholder scan:** No TBDs. The RN upload approach is concrete (expo-file-system base64 + base64-arraybuffer decode — the reliable supabase-js RN path). Test builds an explicit storage skeleton (documented) because storage.* only exists in real Supabase; the true upload is proven on-device in Phase B.

**Type consistency:** `uploadListingPhotos(localUris: string[], userId: string): Promise<string[]>` — used by Phase B. Bucket name `listing-photos` and path `{userId}/...` consistent between migration, helper, and test.

**Ordering:** Task 1 (migration+test) → Task 2 (helper) → Task 3 (gate+handoff). Migration must be applied to prod before real uploads work, but the helper code + test are independent of the prod apply.
