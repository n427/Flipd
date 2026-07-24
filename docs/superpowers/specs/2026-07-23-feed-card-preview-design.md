# Feed card preview

**Date:** 2026-07-23
**Status:** Approved, ready for implementation plan

## Problem

When a seller publishes a new listing, `WebCreate` shows a Preview phase rendering the full **listing detail page** ("This is exactly how buyers will see it"). But the detail page is not the first thing a buyer sees — the **feed card** is: the small square tile in the feed grid. Sellers can't currently see how their listing reads as a card, where the title, location, and seller line each truncate to a single line with ellipsis, and where a bad photo crop is most visible.

## Goal

In the existing Preview phase, also show the feed card exactly as it will appear in the feed — above the detail preview, single column.

## Scope

One block added to the `phase === 'preview'` branch of `WebCreate`
([src/components/WebApp.tsx:1181-1202](../../../src/components/WebApp.tsx#L1181-L1202)),
plus a two-line fix to the `previewListing` object so popups render correctly as cards.

**No new files. No new components. No changes to `ListingCard` or `WebListingDetail`.**

## Design

### Layout (Option A — card above detail, single column)

Inside the preview container, between the "This is exactly how buyers will see it" paragraph and the bordered detail block:

1. A section label `In the feed`, using the existing `.field-label` class.
2. A fixed-width wrapper `<div style={{ width: 210 }}>` containing `<ListingCard listing={previewListing} />` — **no `href`, no `onClick`**. This falls through `ListingCard`'s plain-`<div>` branch ([src/components/ui.tsx:224-228](../../../src/components/ui.tsx#L224)), producing a non-navigable, non-interactive card. Fixed 210px width reproduces true feed column width (the real grid is `minmax(200px, 1fr)`), so title/location/seller truncation behaves exactly as in production.
3. A one-line hint below the card in `t-meta` explaining what to check, e.g. "Long titles, locations, and prices get shortened to one line here." — this is the *reason* the card preview exists.

Then the existing detail block, given a parallel `The listing page` label above it for symmetry.

### Why non-navigable matters

`ListingCard` renders a Next.js `<Link href>` when `href` is passed. `previewListing.id` is the literal string `'preview'` ([src/components/WebApp.tsx:1140](../../../src/components/WebApp.tsx#L1140)); a navigating card would route to `/listing/preview` (a 404). Omitting `href` and `onClick` is the correct and sufficient way to get a dead card — no new prop needed.

### Data — reuse `previewListing`

The existing `previewListing` object ([src/components/WebApp.tsx:1139-1162](../../../src/components/WebApp.tsx#L1139)) already carries every field `ListingCard` reads: `photo_urls`, `photo_focus`, `photoLabel`, `photoTone`, `title`, `meta`, `priceLabel`, `seller`, `eventStart`, `eventEnd`. No new data plumbing.

### Bundled fix — `eventPill` for popups

`ListingCard` shows the event pill and, in place of price, the event window by branching on `listing.eventStart && listing.eventEnd` and reading `listing.eventPill` ([src/components/ui.tsx:205-208, 225-227](../../../src/components/ui.tsx#L205)). For a popup, `previewListing` sets `priceLabel: ''` and populates `eventStart`/`eventEnd`, but **never sets `eventPill`**. Result today: a popup card would show a blank price slot and no date pill.

Fix: derive `eventPill` on `previewListing` the same way production does in the store
([src/lib/store.ts:139-142](../../../src/lib/store.ts#L139)) — reuse `formatEventWindow`, already imported in WebApp.tsx ([line 13](../../../src/components/WebApp.tsx#L13)):

```ts
eventPill: isPopup
  ? (() => {
      const w = parseEventWindow(eventDate, eventStartTime, eventEndTime);
      return w ? formatEventWindow(w.start, w.end) : undefined;
    })()
  : undefined,
```

(Exact expression is an implementation detail; the requirement is: popup preview cards must show the same event pill and window label the real feed card shows, derived via the existing `parseEventWindow` + `formatEventWindow` helpers — no new formatting logic.)

### Missing photo

Photos are required to reach the preview phase, so `ListingCard`'s `Placeholder` fallback is unreachable in practice. No special handling.

## Testing

Presentational change with no logic branch of its own; the only new logic is the `eventPill` derivation, which reuses already-tested helpers (`parseEventWindow`, `formatEventWindow`). Verify by running the app and stepping through post → preview with:

- (a) a normal goods listing — card shows photo, title, location, seller, price;
- (b) a listing with a long title — confirm the card truncates to one line while the detail page shows it in full (the exact discrepancy this feature surfaces);
- (c) a popup — card shows the event pill and the date/time window in place of price, matching the real feed.

No unit tests added.

## Brand / UX conformance

- Single column, one thing at a time — matches the saved Flipd UX-restraint rule (no stacked delight patterns, no fake feed neighbours).
- Labels are terse: `In the feed`, `The listing page`.
- SVG-based card visuals only; no emojis. Named "Flipd" throughout.
