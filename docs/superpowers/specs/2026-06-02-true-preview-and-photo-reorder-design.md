# True Full-Listing Preview + Photo Reorder — Design

**Date:** 2026-06-02

## Goals

1. **True preview:** The step-3 "Here's how buyers will see it" full-listing preview should render the *actual* `WebListingDetail` component (not a hand-built copy), so it matches the buyer view exactly — including the photo thumbnail strip and the ability to cycle through multiple photos.
2. **Photo reorder:** In the editor's photo step, let the seller drag thumbnails to rearrange photo order. `photo_urls` and `photo_focus` reorder together so each crop stays attached to its photo.

## Problem

- The current preview is a separate block that only shows `photos[0]` — no carousel, and it can drift from the real detail layout.
- Photo order is fixed by upload order; sellers can't choose which photo is primary.

## Approach

### Part 1 — Reuse `WebListingDetail` for preview

Add an optional `preview?: boolean` prop to `WebListingDetail`:
- When `preview` is true: hide the "Back to feed" button, and render the Reveal/Save actions as **disabled** (no store interaction). This lets the component render without a live store.
- `WebListingDetail` currently reads `store.isSaved` / `store.toggleSave`. Guard these behind `!preview` so preview mode never calls them. Pass `store` through from the parent (already available in `WebApp`); `WebCreate` gains a `store` prop.

Replace the step-3 full-listing preview markup with:
```tsx
<WebListingDetail store={store} preview listing={previewListing} onBack={() => {}} onReveal={() => {}} />
```
where `previewListing` is the draft assembled from editor state (same object shape already used for the feed-card preview, with `photo_urls` and `photo_focus` arrays).

The component's own `activePhoto` state + thumbnail strip already provide cycling — no new carousel code needed.

### Part 2 — Drag-to-reorder thumbnails (HTML5 DnD)

In `WebCreate`'s step-2 photo grid:
- Make each thumbnail `draggable`. Track `dragFromIndex` in a ref.
- `onDragStart(i)` sets the source index. `onDragOver` calls `preventDefault` (to allow drop). `onDrop(i)` moves the photo from source → target index, applying the same move to `photoFocus` so crops follow their photos. Clamp/adjust `cropIndex` to follow the moved photo if needed (simplest: reset `cropIndex` to the drop target).
- A small visual affordance: reduce opacity of the dragged item (optional, via a `draggingIndex` state).

Reorder helper (pure):
```typescript
function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
```
Applied to both `photos` and `photoFocus` with the same from/to.

## Components & Data Flow

- `WebListingDetail` — add `preview?: boolean`; guard store calls; hide back button; disable actions in preview.
- `WebApp` (root) — pass `store={store}` to `WebCreate`.
- `WebCreate` — accept `store` prop; build `previewListing`; render `WebListingDetail` in step 3; add drag-reorder handlers to thumbnails; `moveItem` helper.

## Error Handling
- Drop on same index → no-op. Drag with no source → ignore.
- `previewListing` always supplies arrays (`photo_urls`, `photo_focus`) so the detail component's `?.[i]` access is safe.

## Testing
- Manual: upload 3 photos, drag the 3rd to position 1 → it becomes primary in the feed-card preview and the first in the detail carousel; its crop stays attached.
- Manual: in step 3, click thumbnails in the full-listing preview to cycle photos; confirm it visually matches opening a published listing.

## Files
- **Modify:** `src/components/WebApp.tsx` — `WebListingDetail` preview prop + guards; `WebCreate` store prop, previewListing, reuse detail in step 3, drag-reorder handlers, `moveItem` helper; root passes `store` to `WebCreate`.

## Scope (YAGNI)
- No reorder animation library; native HTML5 DnD only.
- Preview reuses the real component; no separate "preview-only" styling beyond hiding back/actions.
- `moveItem` kept local to the file (single consumer).
