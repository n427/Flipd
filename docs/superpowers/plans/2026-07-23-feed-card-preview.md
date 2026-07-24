# Feed Card Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In `WebCreate`'s post-preview phase, show the feed card (a non-navigable `ListingCard`) above the existing detail preview, and derive `eventPill` so popup preview cards match the real feed.

**Architecture:** Purely additive change to one component, `WebCreate` in `src/components/WebApp.tsx`. Task 1 fixes the `previewListing` data object so popups carry an `eventPill`. Task 2 renders the feed card in the preview phase. No new files, no new components, no changes to `ListingCard` or `WebListingDetail`.

**Tech Stack:** Next.js (App Router), React, TypeScript, inline-style design system with CSS custom properties.

## Global Constraints

- App is named **Flipd** in all UI — never "Tassel".
- No emojis in UI; use SVG icons / existing `Icon` component.
- Reuse existing helpers and classes; do not add new date-formatting logic (`parseEventWindow` and `formatEventWindow` from `@/lib/validation` are already imported in `WebApp.tsx`).
- This project has no unit tests for presentational components; verification is by running the app (see each task).

---

### Task 1: Derive `eventPill` on `previewListing` for popups

**Files:**
- Modify: `src/components/WebApp.tsx` (the `previewListing` object literal, currently ending around line 1176)

**Interfaces:**
- Consumes: `parseEventWindow(date, start, end)` and `formatEventWindow(startIso, endIso)` from `@/lib/validation` (already imported at the top of `WebApp.tsx`); local `WebCreate` state `isPopup`, `eventDate`, `eventStartTime`, `eventEndTime`.
- Produces: `previewListing.eventPill: string | undefined` — a formatted event-window label for popups, `undefined` otherwise. Task 2's `ListingCard` reads this.

**Context:** `ListingCard` shows the event pill and, for events, the window label in place of price by reading `listing.eventPill` ([src/components/ui.tsx:205-208, 225-227](../../../src/components/ui.tsx#L205)). The `previewListing` object populates `eventStart`/`eventEnd` for popups but never sets `eventPill`, so a popup preview card would show a blank price slot and no date pill. Production derives it in the store via `formatEventWindow` ([src/lib/store.ts:139-142](../../../src/lib/store.ts#L139)); we mirror that.

- [ ] **Step 1: Add the `eventPill` field to `previewListing`**

Find the end of the `previewListing` object literal — the line:

```tsx
    postedLabel: 'just now',
  };
```

Replace it with:

```tsx
    postedLabel: 'just now',
    eventPill: isPopup
      ? (() => {
          const w = parseEventWindow(eventDate, eventStartTime, eventEndTime);
          return w ? formatEventWindow(w.start, w.end) : undefined;
        })()
      : undefined,
  };
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (baseline may have pre-existing output; there must be no error referencing `previewListing`, `eventPill`, `parseEventWindow`, or `formatEventWindow`).

- [ ] **Step 3: Commit**

```bash
git add src/components/WebApp.tsx
git commit -m "fix: derive eventPill on preview listing so popup cards match feed

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Render the feed card in the preview phase

**Files:**
- Modify: `src/components/WebApp.tsx` (the `if (phase === 'preview')` return, currently starting at line 1196)

**Interfaces:**
- Consumes: `ListingCard` (already imported at [src/components/WebApp.tsx:10](../../../src/components/WebApp.tsx#L10)); `previewListing` including the `eventPill` field from Task 1.
- Produces: none (leaf UI).

**Context:** The preview phase currently renders only the detail page. We add the feed card above it. `ListingCard` with no `href` and no `onClick` falls through to a plain non-navigable `<div>` ([src/components/ui.tsx:224-228](../../../src/components/ui.tsx#L224)) — required because `previewListing.id` is `'preview'` and a navigating card would 404 on `/listing/preview`. A fixed 210px wrapper reproduces true feed column width so title/location/price truncation matches production.

- [ ] **Step 1: Insert the feed-card block and label the detail block**

Find this block:

```tsx
        <p style={{ fontFamily: 'var(--sans)', fontSize: 14, color: 'var(--muted)', margin: '0 0 20px' }}>
          This is exactly how buyers will see it.
        </p>
        <div style={{ border: '1px solid var(--rule)', borderRadius: 16, overflow: 'hidden' }}>
          <WebListingDetail store={store} listing={previewListing} preview onBack={() => {}} onReveal={() => {}} />
        </div>
```

Replace it with:

```tsx
        <p style={{ fontFamily: 'var(--sans)', fontSize: 14, color: 'var(--muted)', margin: '0 0 20px' }}>
          This is exactly how buyers will see it.
        </p>

        <label className="field-label">In the feed</label>
        <div style={{ width: 210, marginTop: 4 }}>
          <ListingCard listing={previewListing} />
        </div>
        <p style={{ fontFamily: 'var(--sans)', fontSize: 12.5, color: 'var(--muted)', margin: '8px 0 24px' }}>
          Long titles, locations, and prices get shortened to one line here.
        </p>

        <label className="field-label">The listing page</label>
        <div style={{ border: '1px solid var(--rule)', borderRadius: 16, overflow: 'hidden', marginTop: 4 }}>
          <WebListingDetail store={store} listing={previewListing} preview onBack={() => {}} onReveal={() => {}} />
        </div>
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `WebCreate`, `ListingCard`, or `previewListing`.

- [ ] **Step 3: Verify in the running app**

Run the dev server (`npm run dev`) and, signed in, go through Post → fill a listing → Publish to reach the Preview phase. Verify all three cases:

- **(a) Normal goods listing:** the "In the feed" card shows the photo (cropped per the chosen focus), title, location, seller line, and price — matching the tile style in the feed.
- **(b) Long title:** enter a title longer than the card width. Confirm the card truncates it to one line with an ellipsis while the detail page below shows it in full.
- **(c) Popup:** create a popup listing with a date and time window. Confirm the card shows the event pill (top-left) and the date/time window in place of a price — not a blank price slot.

- [ ] **Step 4: Commit**

```bash
git add src/components/WebApp.tsx
git commit -m "feat: show feed card in post preview

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Layout (Option A: label → 210px card → hint → detail) → Task 2 Step 1. ✓
- Non-navigable card (no `href`/`onClick`) → Task 2 Step 1. ✓
- Reuse `previewListing` data → both tasks; no new data plumbing. ✓
- `eventPill` popup fix via existing helpers → Task 1. ✓
- `The listing page` parallel label → Task 2 Step 1. ✓
- Testing by running (a)/(b)/(c) → Task 2 Step 3. ✓
- Brand/UX conformance (terse labels, no emojis, "Flipd") → Global Constraints + copy in Task 2. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type consistency:** `eventPill` produced in Task 1 (`string | undefined`) matches the optional `eventPill?: string` on the `Listing` type ([src/lib/types.ts:59](../../../src/lib/types.ts#L59)) and is consumed by `ListingCard` in Task 2. `parseEventWindow`/`formatEventWindow` signatures match their definitions in `@/lib/validation`. ✓
