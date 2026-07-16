# Square Crop Focal Point Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let sellers drag to choose which part of their photo a square crop frames, persist that focal point, and honor it in every buyer-facing square (feed card + detail view).

**Architecture:** Store a CSS `object-position` string (`photo_focus`) per listing for the primary photo. Render squares with `object-fit: cover` + `object-position: photo_focus`. The editor's photo step gets a square drag-to-reposition window whose value is sent on publish.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, Supabase Postgres (via MCP migration)

> **Note:** This project is not a git repository, so the "Commit" steps from the standard TDD loop are omitted. Verification is `npx tsc --noEmit` plus a live API round-trip.

---

## File Map

- **Migration (Supabase MCP):** add `photo_focus text not null default '50% 50%'` to `listings`
- **Modify:** `src/lib/types.ts` — add `photo_focus?: string` to `Listing`
- **Modify:** `src/lib/store.ts` — `DbListing` type + `mapDbListing` map `photo_focus`
- **Modify:** `src/app/api/listings/route.ts` — read + insert `photo_focus`
- **Modify:** `src/components/ui.tsx` — `ListingCard` `<img>` gets `objectPosition`
- **Modify:** `src/components/WebApp.tsx` — editor crop window + drag state, publish FormData, detail view square+focus (already partly done), editor preview square+focus

---

## Task 1: Add `photo_focus` column to the database

- [ ] **Step 1: Apply migration via Supabase MCP**

Use the `mcp__supabase__apply_migration` tool, name `add_photo_focus`, query:

```sql
alter table listings add column photo_focus text not null default '50% 50%';
```

- [ ] **Step 2: Verify the column exists**

Use `mcp__supabase__execute_sql`:

```sql
select column_name, data_type, column_default from information_schema.columns
where table_name = 'listings' and column_name = 'photo_focus';
```
Expected: one row, default `'50% 50%'::text`.

---

## Task 2: Add `photo_focus` to the `Listing` type

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add the field**

In `src/lib/types.ts`, add `photo_focus?: string;` immediately after the `photo_urls?: string[];` line in the `Listing` interface:

```typescript
  photo_urls?: string[];
  photo_focus?: string;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/nicole/E-commerce && npx tsc --noEmit 2>&1 | grep -v "popup"
```
Expected: no errors.

---

## Task 3: Map `photo_focus` in the store

**Files:**
- Modify: `src/lib/store.ts`

- [ ] **Step 1: Add `photo_focus` to the `DbListing` type**

Find the `DbListing` type and add the field after `photo_urls`:

```typescript
  photo_urls?: string[] | null;
  photo_focus?: string | null;
```

- [ ] **Step 2: Map it in `mapDbListing`**

In `mapDbListing`, add after the `photo_urls` line in the returned object:

```typescript
    photo_urls: row.photo_urls || [],
    photo_focus: row.photo_focus || '50% 50%',
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/nicole/E-commerce && npx tsc --noEmit 2>&1 | grep -v "popup"
```
Expected: no errors.

---

## Task 4: Read and insert `photo_focus` in the POST route

**Files:**
- Modify: `src/app/api/listings/route.ts`

- [ ] **Step 1: Read `photo_focus` from FormData**

After the `const contact = ...` line in `POST`, add:

```typescript
  const photoFocus = (formData.get('photo_focus') as string) || '50% 50%';
```

- [ ] **Step 2: Include it in the insert**

In the `.insert({ ... })` object, add after `photo_urls: photoUrls,`:

```typescript
      photo_urls: photoUrls,
      photo_focus: photoFocus,
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/nicole/E-commerce && npx tsc --noEmit 2>&1 | grep -v "popup"
```
Expected: no errors.

---

## Task 5: Honor `photo_focus` in `ListingCard`

**Files:**
- Modify: `src/components/ui.tsx`

- [ ] **Step 1: Add `objectPosition` to the card image**

Find (in `ListingCard`):

```tsx
          <img
            src={listing.photo_urls[0]}
            alt={listing.title}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
```

Replace the `style` to add `objectPosition`:

```tsx
          <img
            src={listing.photo_urls[0]}
            alt={listing.title}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: listing.photo_focus || '50% 50%' }}
          />
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/nicole/E-commerce && npx tsc --noEmit 2>&1 | grep -v "popup"
```
Expected: no errors.

---

## Task 6: Confirm the detail view main image is square + focus-aware

**Files:**
- Modify: `src/components/WebApp.tsx` (WebListingDetail, ~line 270)

> This block was partially updated in a prior session. This task confirms it matches the target exactly.

- [ ] **Step 1: Ensure the main-image block reads**

The main image in `WebListingDetail` should be:

```tsx
          {listing.photo_urls?.[activePhoto] ? (
            <div style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 4, overflow: 'hidden' }}>
              <img
                src={listing.photo_urls[activePhoto]}
                alt={listing.title}
                style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: listing.photo_focus || '50% 50%', display: 'block' }}
              />
            </div>
          ) : (
            <Placeholder label={listing.photoLabel} tone={thumbTones[activePhoto % thumbTones.length]} height={460} radius={4} />
          )}
```

If it differs, edit it to match. (Note: only `activePhoto === 0` truly uses the seller's chosen focus; secondary photos also apply the same string, which is acceptable — center for others is a future refinement.)

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/nicole/E-commerce && npx tsc --noEmit 2>&1 | grep -v "popup"
```
Expected: no errors.

---

## Task 7: Add the editor crop window with drag-to-reposition

**Files:**
- Modify: `src/components/WebApp.tsx` (WebCreate component)

- [ ] **Step 1: Add focus state**

After `const [photos, setPhotos] = React.useState<{ file: File; url: string }[]>([]);` add:

```typescript
  const [photoFocus, setPhotoFocus] = React.useState('50% 50%');
  const dragState = React.useRef<{ startX: number; startY: number; baseX: number; baseY: number; w: number; h: number } | null>(null);
```

- [ ] **Step 2: Add drag handlers (above the `return`, near `publish`)**

Add these helpers inside `WebCreate`, just before `const publish = ...`:

```typescript
  const parseFocus = (f: string): [number, number] => {
    const [x, y] = f.split(' ').map((p) => parseFloat(p));
    return [isNaN(x) ? 50 : x, isNaN(y) ? 50 : y];
  };

  const onCropPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const [bx, by] = parseFocus(photoFocus);
    dragState.current = { startX: e.clientX, startY: e.clientY, baseX: bx, baseY: by, w: rect.width, h: rect.height };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onCropPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragState.current;
    if (!d) return;
    // Dragging right reveals the left of the image → decrease X percent.
    const dxPct = ((e.clientX - d.startX) / d.w) * 100;
    const dyPct = ((e.clientY - d.startY) / d.h) * 100;
    const clamp = (n: number) => Math.max(0, Math.min(100, n));
    setPhotoFocus(`${clamp(d.baseX - dxPct)}% ${clamp(d.baseY - dyPct)}%`);
  };

  const onCropPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragState.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };
```

- [ ] **Step 2b: Reset focus when the first photo is removed/replaced**

This is optional polish; skip for now (YAGNI). Default stays `'50% 50%'`.

- [ ] **Step 3: Render the crop window after the photo grid**

Find the closing of the photo grid `</div>` immediately before `<label className="field-label">Title</label>` (the grid that maps `photos`). Insert this block between them:

```tsx
          {photos[0] && (
            <div style={{ marginBottom: 24 }}>
              <div className="field-label" style={{ marginBottom: 8 }}>Adjust crop — drag to reposition</div>
              <div
                onPointerDown={onCropPointerDown}
                onPointerMove={onCropPointerMove}
                onPointerUp={onCropPointerUp}
                style={{ width: 220, aspectRatio: '1 / 1', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--rule)', cursor: 'grab', touchAction: 'none', userSelect: 'none' }}
              >
                <img
                  src={photos[0].url}
                  alt="crop preview"
                  draggable={false}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: photoFocus, display: 'block', pointerEvents: 'none' }}
                />
              </div>
            </div>
          )}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/nicole/E-commerce && npx tsc --noEmit 2>&1 | grep -v "popup"
```
Expected: no errors.

---

## Task 8: Send `photo_focus` on publish and use it in the editor preview

**Files:**
- Modify: `src/components/WebApp.tsx` (WebCreate `publish`, step-3 preview)

- [ ] **Step 1: Append `photo_focus` in `publish`**

In the `publish` function, after the `photos.forEach(...)` line and before `onPublish(fd);`, add:

```typescript
    fd.append('photo_focus', photoFocus);
```

- [ ] **Step 2: Pass focus to the feed-card preview**

In the step-3 preview's `ListingCard`, add `photo_focus` to the preview listing object after `photo_urls: photos.map((p) => p.url),`:

```tsx
                  photo_urls: photos.map((p) => p.url),
                  photo_focus: photoFocus,
```

- [ ] **Step 3: Make the full-listing preview image square + focus-aware**

Find the step-3 full-listing preview image block:

```tsx
                {photos[0] ? (
                  <div style={{ width: '100%', height: 460, borderRadius: 4, background: 'var(--cream)', border: '1px solid var(--rule)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    <img
                      src={photos[0].url}
                      alt={title || 'your photo'}
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
                    />
                  </div>
                ) : (
                  <Placeholder label="your photo" tone={toneFor(category)} height={460} radius={4} />
                )}
```

Replace with:

```tsx
                {photos[0] ? (
                  <div style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 4, overflow: 'hidden' }}>
                    <img
                      src={photos[0].url}
                      alt={title || 'your photo'}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: photoFocus, display: 'block' }}
                    />
                  </div>
                ) : (
                  <Placeholder label="your photo" tone={toneFor(category)} height={460} radius={4} />
                )}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/nicole/E-commerce && npx tsc --noEmit 2>&1 | grep -v "popup"
```
Expected: no errors.

---

## Task 9: End-to-end verification

- [ ] **Step 1: Round-trip the API with a focus value**

```bash
cd /tmp && python3 -c "
import zlib, struct
def chunk(t,d):
    c=t+d; return struct.pack('>I',len(d))+c+struct.pack('>I',zlib.crc32(c)&0xffffffff)
w=h=120; raw=b''.join(b'\x00'+bytes([40,90,200])*w for _ in range(h))
open('c.png','wb').write(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b''))
"
curl -s -m 20 -X POST http://localhost:3000/api/listings \
  -F "category=goods" -F "title=Crop Test" -F "description=x" -F "price=5" \
  -F "negotiable=false" -F "location=USC" -F 'contact=["instagram"]' \
  -F "photo_focus=30% 80%" -F "photos=@c.png;type=image/png"
rm -f /tmp/c.png
```
Expected: JSON with `"photo_focus":"30% 80%"` in the returned listing.

- [ ] **Step 2: Confirm GET returns the focus**

```bash
curl -s http://localhost:3000/api/listings | python3 -c "import sys,json; print([l.get('photo_focus') for l in json.load(sys.stdin)['listings']])"
```
Expected: list includes `'30% 80%'`.

- [ ] **Step 3: Clean up the test row**

Use `mcp__supabase__execute_sql`:

```sql
delete from listings where title = 'Crop Test';
```

- [ ] **Step 4: Manual browser check**

1. Open `http://localhost:3000/feed` → Post a listing
2. Upload a non-square photo, drag the crop window to reframe
3. Publish; confirm the feed card and detail view show the same off-center crop
