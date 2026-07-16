# Choosable Square Crop Focal Point — Design

**Date:** 2026-06-01

## Goal

Listing images display as a **square** everywhere (feed card, detail view, editor preview). The seller chooses *which part* of their photo the square frames by dragging the image inside a square window in the editor. That choice persists and every buyer-facing square honors it.

## Problem

Square crops currently use a fixed center focus (`object-position: 50% 50%`). A tall or wide photo gets its subject cropped out. Sellers need to control the focal point.

## Approach

Store a CSS `object-position` string per listing and apply it with `object-fit: cover` on a square container. Rendering becomes trivial; the only real work is the editor drag interaction and threading one value through the stack.

### Scope (YAGNI)

- **Primary photo only.** One focus value per listing, applied to `photo_urls[0]`. Secondary photos use center crop.
- **Pan only, no zoom.** Dragging repositions; no scaling.
- **Thumbnails unchanged.** Small upload slots and detail thumbnail strip stay center-cropped.

## Data Model

Add a column to `listings`:

```sql
alter table listings add column photo_focus text not null default '50% 50%';
```

Value is a CSS `object-position` string, e.g. `'50% 50%'`, `'30% 80%'`. Percentages 0–100 on each axis.

`Listing` type gains:

```typescript
photo_focus?: string;
```

## Components & Data Flow

### Editor (create flow, photo step) — `WebCreate`

- New local state: `const [photoFocus, setPhotoFocus] = React.useState('50% 50%')`.
- After the first photo is uploaded, render a **square crop window** (`aspect-ratio: 1/1`, `overflow: hidden`) containing the image at `object-fit: cover`, `object-position: photoFocus`.
- Drag handler: on pointer drag inside the window, translate cumulative drag delta into an `object-position` percentage (clamped 0–100 each axis) and call `setPhotoFocus`. Hint text: "Drag to reposition."
- `publish()` appends `fd.append('photo_focus', photoFocus)`.

**Drag → object-position mapping:** moving the pointer right reveals the left side of the image, i.e. decreases the X percentage. Convert pointer movement to a percentage of the window size; accumulate and clamp to `[0, 100]`. Vertical analogous.

### API — `POST /api/listings`

- Read `const photoFocus = (formData.get('photo_focus') as string) || '50% 50%';`
- Include `photo_focus: photoFocus` in the insert.
- `GET` returns all columns already — no change.

### Store — `mapDbListing`

- Map `photo_focus: row.photo_focus || '50% 50%'` onto the `Listing`.
- `DbListing` type gains `photo_focus?: string | null`.

### Render sites (all square, all honor focus)

- **`ListingCard`** (`ui.tsx`): already a square via `aspectRatio: '1 / 1'`. Add `objectPosition: listing.photo_focus || '50% 50%'` to the `<img>`.
- **`WebListingDetail`** main image (`WebApp.tsx`): square container (`aspectRatio: 1/1`), `objectFit: cover`, `objectPosition: listing.photo_focus`.
- **Editor preview** "how buyers will see it" full-listing image (`WebApp.tsx`): square container, `objectFit: cover`, `objectPosition: photoFocus` (the live editor value). The feed-card preview uses `ListingCard`, which already reads `photo_urls`; pass `photo_focus: photoFocus` into the preview listing object.

## Error Handling

- Missing/invalid `photo_focus` → default `'50% 50%'` at every layer (API insert default, DB column default, `mapDbListing` fallback, render fallback). No validation beyond clamping in the drag handler.

## Testing

- Manual: upload a non-square photo, drag the focal point, publish, confirm feed card + detail view show the same crop.
- Verify default-center crop still works for listings created before this change (DB default backfills existing rows).

## Files

- **Migration (via Supabase MCP):** add `photo_focus` column.
- **Modify:** `src/lib/types.ts` — add `photo_focus?: string`.
- **Modify:** `src/lib/store.ts` — `DbListing` + `mapDbListing`.
- **Modify:** `src/app/api/listings/route.ts` — read + insert `photo_focus`.
- **Modify:** `src/components/WebApp.tsx` — editor crop window + drag, publish FormData, detail view square, editor preview square + focus.
- **Modify:** `src/components/ui.tsx` — `ListingCard` `objectPosition`.
