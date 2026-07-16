# Per-Photo Crop Focal Point Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give each photo in a listing its own square crop focal point, settable per photo in the editor and honored per photo in the detail carousel.

**Architecture:** Convert `photo_focus` from a scalar to a `text[]` index-aligned with `photo_urls`. Editor keeps a `string[]` of focuses + a `cropIndex` selector. Renders fall back to `'50% 50%'` per index.

**Tech Stack:** Next.js 14, React, TypeScript, Supabase Postgres (MCP migration).

> Not a git repo — commit steps omitted. Verify with `npx tsc --noEmit` + API round-trip.

---

## Task 1: Migrate `photo_focus` to `text[]`

- [ ] **Step 1:** `mcp__supabase__apply_migration` name `photo_focus_to_array`:
```sql
alter table listings drop column photo_focus;
alter table listings add column photo_focus text[] not null default '{}';
```
- [ ] **Step 2:** Verify with `mcp__supabase__execute_sql`:
```sql
select data_type, udt_name from information_schema.columns where table_name='listings' and column_name='photo_focus';
```
Expected: `data_type` = `ARRAY`, `udt_name` = `_text`.

## Task 2: Types

- [ ] In `src/lib/types.ts`, change `photo_focus?: string;` to `photo_focus?: string[];`.
- [ ] In `src/lib/store.ts` `DbListing`, change `photo_focus?: string | null;` to `photo_focus?: string[] | null;`.
- [ ] In `mapDbListing`, change `photo_focus: row.photo_focus || '50% 50%',` to `photo_focus: row.photo_focus || [],`.
- [ ] `npx tsc --noEmit` — expect errors at render sites still using scalar (fixed next tasks).

## Task 3: API

- [ ] In `route.ts`, replace `const photoFocus = (formData.get('photo_focus') as string) || '50% 50%';` with:
```typescript
  const photoFocusRaw = formData.getAll('photo_focus') as string[];
```
- [ ] After `photoFiles` is known, build aligned array. Replace insert line `photo_focus: photoFocus,` with `photo_focus: focusArr,` and add just before the insert:
```typescript
  const focusArr = photoFiles.map((_, i) => photoFocusRaw[i] || '50% 50%');
```
- [ ] `npx tsc --noEmit`.

## Task 4: ListingCard

- [ ] In `ui.tsx`, change `objectPosition: listing.photo_focus || '50% 50%'` to `objectPosition: listing.photo_focus?.[0] || '50% 50%'`.

## Task 5: Detail view per-photo focus

- [ ] In `WebApp.tsx` main detail image, change `objectPosition: listing.photo_focus || '50% 50%'` to `objectPosition: listing.photo_focus?.[activePhoto] || '50% 50%'`.

## Task 6: Editor state → arrays + alignment

- [ ] Change `const [photoFocus, setPhotoFocus] = React.useState('50% 50%');` to:
```typescript
  const [photoFocus, setPhotoFocus] = React.useState<string[]>([]);
  const [cropIndex, setCropIndex] = React.useState(0);
```
- [ ] In `handleFileChange`, after `setPhotos((prev) => {...})`, keep `photoFocus` aligned. Replace the body so focus is updated in lockstep:
```typescript
    setPhotos((prev) => {
      const next = [...prev];
      if (pendingSlot !== null && pendingSlot < next.length) {
        URL.revokeObjectURL(next[pendingSlot].url);
        next[pendingSlot] = { file, url };
      } else {
        next.push({ file, url });
      }
      return next;
    });
    setPhotoFocus((prev) => {
      const next = [...prev];
      if (pendingSlot !== null && pendingSlot < next.length) next[pendingSlot] = '50% 50%';
      else next.push('50% 50%');
      return next;
    });
    setCropIndex(pendingSlot !== null ? pendingSlot : photos.length);
```
- [ ] In `removePhoto`, splice focus too and clamp `cropIndex`:
```typescript
  const removePhoto = (index: number) => {
    setPhotos((prev) => {
      const next = [...prev];
      URL.revokeObjectURL(next[index].url);
      next.splice(index, 1);
      return next;
    });
    setPhotoFocus((prev) => { const next = [...prev]; next.splice(index, 1); return next; });
    setCropIndex((c) => Math.max(0, c >= index ? c - 1 : c));
  };
```

## Task 7: Drag handlers use `cropIndex`

- [ ] Update `onCropPointerDown`: `const [bx, by] = parseFocus(photoFocus[cropIndex] || '50% 50%');`
- [ ] Update `onCropPointerMove` setter to update only `cropIndex`:
```typescript
    setPhotoFocus((prev) => {
      const next = [...prev];
      next[cropIndex] = `${clamp(d.baseX - dxPct)}% ${clamp(d.baseY - dyPct)}%`;
      return next;
    });
```

## Task 8: Thumbnail selector + crop window for `cropIndex`

- [ ] In the step-2 photo grid, make each thumbnail set `cropIndex` and show a highlight. Change the mapped thumbnail `<div>` to:
```tsx
              <div key={i} onClick={() => setCropIndex(i)} style={{ position: 'relative', height: 84, borderRadius: 6, overflow: 'hidden', cursor: 'pointer', outline: cropIndex === i ? '2px solid var(--cardinal)' : 'none', outlineOffset: -1 }}>
```
- [ ] Change the crop window to use `cropIndex`: `src={photos[cropIndex]?.url}` and `objectPosition: photoFocus[cropIndex] || '50% 50%'`, and guard `{photos[cropIndex] && (`. Update label to `Adjust crop — photo {cropIndex + 1} — drag to reposition`.

## Task 9: Publish + preview

- [ ] In `publish`, replace `fd.append('photo_focus', photoFocus);` with:
```typescript
    photoFocus.forEach((f) => fd.append('photo_focus', f));
```
- [ ] In step-3 feed-card preview, `photo_focus: photoFocus,` already an array — leave as is (now string[]).
- [ ] In step-3 full-listing preview image, change `objectPosition: photoFocus` to `objectPosition: photoFocus[0] || '50% 50%'`.
- [ ] `npx tsc --noEmit` — expect clean.

## Task 10: Verify

- [ ] POST two photos with two focus values, GET, assert 2-element array in order.
- [ ] Delete the test row.
- [ ] Manual browser: 2 photos, different crops, publish, confirm carousel honors each.
