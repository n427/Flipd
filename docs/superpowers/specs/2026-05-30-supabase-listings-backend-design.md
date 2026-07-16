# Supabase Listings Backend Design

## Summary

Replace the in-memory listings store with a real Supabase backend: Postgres for listing data, Supabase Storage for photos. Three Next.js API routes handle create and read. The frontend integrates via fetch calls, keeping all non-listing state (saves, activity, reveals) in memory unchanged.

---

## Database Schema

**Table: `listings`** (Supabase Postgres)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `seller_id` | `text` | Hardcoded `"user_alex_park"` until auth is wired |
| `category` | `text` | One of: `services`, `food`, `event`, `housing`, `goods`, `popup` |
| `title` | `text` | Required |
| `description` | `text` | Optional |
| `price` | `integer` | In cents (e.g. $12 → 1200). 0 = free |
| `negotiable` | `boolean` | Default false |
| `location` | `text` | Pickup location string |
| `contact` | `text[]` | Array of `'instagram'`, `'phone'`, `'email'` |
| `photo_urls` | `text[]` | Public Supabase Storage URLs |
| `created_at` | `timestamptz` | Default `now()` |

**Supabase Storage**

- Bucket: `listing-photos` (public)
- Path pattern: `{listing_id}/{original_filename}`
- Photos uploaded before row insert; URLs collected then stored in `photo_urls`

**Row-level security:** disabled for now (hardcoded user, no auth yet). Enable when auth lands.

---

## API Routes

### `POST /api/listings`

- Accepts `multipart/form-data`
- Fields: `category`, `title`, `description`, `price`, `negotiable`, `location`, `contact` (JSON array string), `photos` (one or more File entries)
- Flow:
  1. Generate a new UUID for the listing id
  2. Upload each photo to `listing-photos/{id}/{filename}` via Supabase Storage
  3. Collect public URLs
  4. Insert row into `listings`
  5. Return the inserted row as JSON
- Error: 400 if `title` or `photos` missing; 500 on Supabase error

### `GET /api/listings`

- Query params: `category` (optional), `q` (optional text search on title)
- Fetches from `listings` ordered by `created_at DESC`
- Applies WHERE filters in SQL
- Returns `{ listings: Listing[] }`

### `GET /api/listings/[id]`

- Fetches single row by `id`
- Returns `{ listing: Listing }` or 404

---

## Type Changes

`src/lib/types.ts`:
- Add `photo_urls?: string[]` to `Listing`
- Add `description?: string` already exists — ensure it's populated from DB

`src/lib/types.ts` `NewListingInput` already has `description`. No other type changes needed.

---

## Frontend Integration

**`src/lib/store.ts`**

Add to `useFlipdStore`:
- `listingsLoading: boolean` state, initially `true`
- `fetchListings()` — calls `GET /api/listings`, sets listings state and turns off loading
- `addListing()` — sends `FormData` to `POST /api/listings`, prepends returned listing to state
- `useEffect` on mount calls `fetchListings()`
- Mock seed data (`MOCK_LISTINGS`, `MY_SEED`) removed from initial listings state (kept in `data.ts` for reference only)

**`src/components/WebApp.tsx`** — `WebCreate` publish handler

- Builds a `FormData` object from all form state
- Passes `photos` as `File` objects (already held in `photos` state as `{ file: File, url: string }[]`)
- Calls updated `store.addListing(formData)`

**`src/components/ui.tsx`** — `ListingCard`

- If `listing.photo_urls?.[0]` exists: render `<img>` instead of `<Placeholder>`
- Otherwise: fall back to existing `<Placeholder>`

**`src/components/WebApp.tsx`** — `WebListingDetail`

- Main photo: use `listing.photo_urls?.[activePhoto]` as `<img>` if present, else `<Placeholder>`
- Thumbnails: render from `photo_urls` array; fall back to tone-based placeholders if empty

---

## Environment Variables

Add to `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

API routes use `SUPABASE_SERVICE_ROLE_KEY` (server-only). The anon key is available for future client-side use.

---

## Dependencies

- `@supabase/supabase-js` — Supabase client

---

## Out of Scope

- Auth (seller_id hardcoded)
- Saves, activity, reveal flow persistence (stays in-memory)
- Listing update/delete
- Real-time feed updates
