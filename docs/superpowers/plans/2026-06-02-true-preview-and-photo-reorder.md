# True Preview + Photo Reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Render the real `WebListingDetail` in the step-3 preview (so it matches buyers exactly, with photo cycling), and let sellers drag thumbnails to reorder photos (crops follow).

**Architecture:** Add `preview?: boolean` to `WebListingDetail` to render without store interaction. Thread `store` into `WebCreate`. HTML5 drag-and-drop reorders `photos` + `photoFocus` together via a `moveItem` helper.

**Tech Stack:** Next.js 14, React, TypeScript. No new deps.

> Not a git repo — verify with `npx tsc --noEmit` + manual browser check.

---

## Task 1: Add `preview` mode to `WebListingDetail`

**Files:** `src/components/WebApp.tsx`

- [ ] **Step 1: Add the prop**

Change the signature:
```typescript
function WebListingDetail({
  store, listing, onBack, onReveal, preview = false,
}: { store: FlipdStore; listing: Listing; onBack: () => void; onReveal: () => void; preview?: boolean }) {
  const saved = preview ? false : store.isSaved(listing.id);
```

- [ ] **Step 2: Hide the back button in preview**

Wrap the back button (the `<button onClick={onBack} ...>Back to feed</button>`) in `{!preview && ( ... )}`.

- [ ] **Step 3: Disable actions in preview**

Replace the action buttons block:
```tsx
          <div style={{ display: 'flex', gap: 10 }}>
            <Button kind="primary" full size="lg" onClick={onReveal} icon="shield">Reveal Contact</Button>
            <Button kind={saved ? 'primary' : 'secondary'} size="lg" icon="bookmark" onClick={() => store.toggleSave(listing.id)}>
              {saved ? 'Saved' : 'Save'}
            </Button>
          </div>
```
with:
```tsx
          <div style={{ display: 'flex', gap: 10 }}>
            <Button kind="primary" full size="lg" onClick={preview ? () => {} : onReveal} icon="shield" disabled={preview}>Reveal Contact</Button>
            <Button kind={saved ? 'primary' : 'secondary'} size="lg" icon="bookmark" onClick={() => { if (!preview) store.toggleSave(listing.id); }} disabled={preview}>
              {saved ? 'Saved' : 'Save'}
            </Button>
          </div>
```

- [ ] **Step 4:** `npx tsc --noEmit` — expect clean (component still used the old way elsewhere).

## Task 2: Pass `store` into `WebCreate`

**Files:** `src/components/WebApp.tsx`

- [ ] **Step 1: Add `store` to `WebCreate` props**

Change:
```typescript
function WebCreate({
  onPublish, onCancel,
}: { onPublish: (formData: FormData) => void; onCancel: () => void }) {
```
to:
```typescript
function WebCreate({
  onPublish, onCancel, store,
}: { onPublish: (formData: FormData) => void; onCancel: () => void; store: FlipdStore }) {
```

- [ ] **Step 2: Pass it at the call site**

In the root `WebApp`, the `<WebCreate ...>` render — add `store={store}`:
```tsx
        <WebCreate
          store={store}
          onCancel={goFeed}
          onPublish={async (fd) => {
```

- [ ] **Step 3:** `npx tsc --noEmit` — expect clean.

## Task 3: Build `previewListing` and replace the full-listing preview

**Files:** `src/components/WebApp.tsx` (step-3 preview)

- [ ] **Step 1: Add a `previewListing` just inside `{step === 3 && (`**

Immediately after `<div>` opening step 3 (before the heading), add:
```tsx
          {(() => null)()}
```
No — instead, define it inline where used. In Step 2 below we pass an object literal.

- [ ] **Step 2: Replace the entire "Full listing preview" card body**

Find the full-listing preview card (the `<div>` with eyebrow `FULL LISTING` and the hand-built grid). Replace its inner content (everything between the eyebrow `</div>` and the card's closing `</div>`) so the card becomes:
```tsx
          {/* Full listing preview */}
          <div style={{ background: '#fff', border: '1px solid var(--rule)', borderRadius: 10, padding: 24, marginBottom: 32, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div className="t-eyebrow" style={{ color: 'var(--muted)', marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid var(--rule)' }}>FULL LISTING</div>
            <WebListingDetail
              store={store}
              preview
              onBack={() => {}}
              onReveal={() => {}}
              listing={{
                id: 'preview',
                category: category || 'goods',
                categoryLabel: (CATEGORIES.find((c) => c.id === category) || {}).label || 'Goods',
                title: title || 'Untitled listing',
                price: price ? Number(price) : undefined,
                priceLabel: price ? '$' + price : 'Free',
                meta: location,
                photoTone: toneFor(category),
                photoLabel: 'your photo',
                photo_urls: photos.map((p) => p.url),
                photo_focus: photoFocus,
                description,
                seller: CURRENT_USER,
                postedLabel: 'just now',
              }}
            />
          </div>
```

- [ ] **Step 3:** `npx tsc --noEmit` — expect clean.

- [ ] **Step 4: Manual check** — step 3 full-listing preview now shows the real detail layout; clicking thumbnails cycles photos.

## Task 4: Add `moveItem` helper and drag-reorder state

**Files:** `src/components/WebApp.tsx`

- [ ] **Step 1: Add `moveItem` near the top of the file (module scope, after imports)**

```typescript
function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
```

- [ ] **Step 2: Add drag state in `WebCreate`** (after `cropIndex` state):
```typescript
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
```

- [ ] **Step 3: Add a reorder handler in `WebCreate`** (near `removePhoto`):
```typescript
  const reorderPhotos = (from: number, to: number) => {
    if (from === to) return;
    setPhotos((prev) => moveItem(prev, from, to));
    setPhotoFocus((prev) => moveItem(prev, from, to));
    setCropIndex(to);
  };
```

- [ ] **Step 4:** `npx tsc --noEmit` — expect clean.

## Task 5: Wire drag-and-drop onto the thumbnails

**Files:** `src/components/WebApp.tsx` (step-2 photo grid)

- [ ] **Step 1: Make each thumbnail draggable + droppable**

Change the mapped thumbnail wrapper `<div key={i} onClick={() => setCropIndex(i)} style={{ ... }}>` to add DnD handlers and a dragging affordance:
```tsx
              <div
                key={i}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragIndex !== null) reorderPhotos(dragIndex, i); setDragIndex(null); }}
                onDragEnd={() => setDragIndex(null)}
                onClick={() => setCropIndex(i)}
                style={{ position: 'relative', height: 84, borderRadius: 6, overflow: 'hidden', cursor: 'grab', opacity: dragIndex === i ? 0.4 : 1, outline: cropIndex === i ? '2px solid var(--cardinal)' : 'none', outlineOffset: -1 }}
              >
```

- [ ] **Step 2: Add a hint above the grid**

Just before the photo grid `<div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)' ...}}>`, add:
```tsx
          {photos.length > 1 && (
            <div className="t-meta" style={{ fontSize: 11, marginBottom: 8, color: 'var(--muted)' }}>
              Drag photos to reorder · the first photo is your cover
            </div>
          )}
```

- [ ] **Step 3:** `npx tsc --noEmit` — expect clean.

- [ ] **Step 4: Manual check** — drag the 3rd thumbnail to first; it becomes the cover in the feed-card preview and first in the detail carousel; its crop stays attached.

## Task 6: End-to-end verification

- [ ] **Step 1:** `npx tsc --noEmit` clean.
- [ ] **Step 2:** Post 3 photos, reorder, set distinct crops, publish. GET and confirm `photo_urls` + `photo_focus` are in the reordered order and index-aligned.
- [ ] **Step 3:** Delete the test row via `mcp__supabase__execute_sql`.
