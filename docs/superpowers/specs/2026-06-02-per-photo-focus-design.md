# Per-Photo Crop Focal Point — Design

**Date:** 2026-06-02

## Goal

Extend the single-focus feature so **each photo** in a listing has its own square crop focal point. The editor lets the seller pick which photo to adjust (by clicking its thumbnail) and drag to set that photo's focus. The feed card uses the primary photo's focus; the detail-view carousel uses each photo's own focus.

## Problem

`photo_focus` is currently one `text` value applied to the primary photo. Secondary photos in the detail carousel reuse that same string, which crops them wrong. Each photo needs its own focal point.

## Approach

Change `photo_focus` from a scalar to an **index-aligned array** parallel to `photo_urls`. Entry `i` is the `object-position` for photo `i`. Render each square with `object-fit: cover` + the per-index focus, falling back to center when an entry is missing.

### Scope (YAGNI)
- Pan only, no zoom.
- Arrays kept aligned by index (add pushes a default; remove splices).
- Feed card shows the primary photo (index 0) and its focus.

## Data Model

Migrate the column from scalar to array:

```sql
alter table listings drop column photo_focus;
alter table listings add column photo_focus text[] not null default '{}';
```

(Only one real row exists; it gets `{}` and falls back to center. No backfill of values needed.)

Types:
- `Listing.photo_focus?: string[]`
- `DbListing.photo_focus?: string[] | null`

## Components & Data Flow

### Store — `mapDbListing`
- Map `photo_focus: row.photo_focus || []`.

### Render helper
A small inline helper used at each render site:
```typescript
const focusAt = (l: Listing, i: number) => l.photo_focus?.[i] || '50% 50%';
```
(Defined locally where needed; not exported — each component computes its own since it's a one-liner.)

### `ListingCard` (`ui.tsx`)
- Primary image uses `listing.photo_focus?.[0] || '50% 50%'`.

### `WebListingDetail` main image (`WebApp.tsx`)
- Uses `listing.photo_focus?.[activePhoto] || '50% 50%'` so each carousel photo honors its own focus.

### API — `POST /api/listings`
- Read all focus values aligned to photo order: `const photoFocus = formData.getAll('photo_focus') as string[];`
- Normalize length to match photo count, defaulting missing entries to `'50% 50%'`:
  ```typescript
  const focusArr = photoFiles.map((_, i) => photoFocus[i] || '50% 50%');
  ```
- Insert `photo_focus: focusArr`.

### Editor — `WebCreate`
- State: `photoFocus` becomes `string[]` (one entry per photo). New `cropIndex` number for the photo currently being adjusted.
- **Add photo** (`handleFileChange`): push `'50% 50%'` to `photoFocus` for a new slot; for a replaced slot, reset that index to `'50% 50%'`. Set `cropIndex` to the affected slot.
- **Remove photo** (`removePhoto`): splice the same index out of `photoFocus`; clamp `cropIndex`.
- **Thumbnail selector:** the existing step-2 photo grid thumbnails become clickable to set `cropIndex`, with a highlight outline on the selected one.
- **Crop window:** shows `photos[cropIndex]` at `objectPosition: photoFocus[cropIndex]`. Drag updates only `photoFocus[cropIndex]`.
- **Publish:** append each focus in order: `photoFocus.forEach((f) => fd.append('photo_focus', f));`

### Editor preview (step 3)
- Feed-card preview: `photo_focus: photoFocus` (array passed through).
- Full-listing preview image: uses `photoFocus[0] || '50% 50%'` (preview shows the primary photo).

## Error Handling
- Missing/short `photo_focus` array → per-index fallback to `'50% 50%'` at every render and in the API normalization. Drag handler clamps each axis to `[0, 100]`.

## Testing
- API round-trip: POST two photos with two distinct focus values → GET returns a 2-element `photo_focus` array in order.
- Manual: upload 2+ photos, set a different crop on each, publish, confirm the detail carousel shows each photo's own crop and the feed card shows the primary's.

## Files
- **Migration (Supabase MCP):** convert `photo_focus` to `text[]`.
- **Modify:** `src/lib/types.ts` — `photo_focus?: string[]`.
- **Modify:** `src/lib/store.ts` — `DbListing` + `mapDbListing`.
- **Modify:** `src/app/api/listings/route.ts` — read array, normalize, insert.
- **Modify:** `src/components/ui.tsx` — `ListingCard` index-0 focus.
- **Modify:** `src/components/WebApp.tsx` — array state, add/remove alignment, thumbnail selector, crop window per `cropIndex`, detail per-`activePhoto` focus, publish loop, preview.
