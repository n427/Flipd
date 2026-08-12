# Mobile navigation: stack-based detail screens

**Date:** 2026-08-11
**Status:** Approved

## Goal

Give every pushed screen a real back stack, so opening a listing, a profile, or a
conversation slides in, swipes back, and returns to wherever it was opened from.

## Context

Every detail screen in the app is a **tab**. `app/(tabs)/_layout.tsx` registers
eleven routes with `href: null` — `listing/[id]/index`, `listing/[id]/edit`,
`u/[id]`, `messages/[id]`, `edit-profile`, `saved`, `reviews`, `my-listings`,
`terms`, `privacy`, `support` — which hides them from the tab bar but leaves them
in a Tabs navigator.

Tabs have no back stack. That single fact produces five separate user-visible
defects:

| Symptom | Cause |
| --- | --- |
| Swipe-back missing | No stack, so no gesture; a hand-written one is bolted onto two screens |
| No back affordance | Tabs render no header, so each screen hand-rolls one — inconsistently, and `u/[id]` has none at all |
| Openings feel abrupt | Tab switches do not animate; a stack push slides |
| Back from a conversation lands on the wrong page | No history to pop, so back guesses |
| Opening a second conversation shows the first one | Tabs stay mounted and are reused; stale state paints until new data arrives |

The workaround already in the tree documents the debt. `EdgeSwipeBackGesture.tsx`
says:

> These screens live in the Tabs navigator, which has no back stack and so
> provides no swipe gesture of its own. Rather than restructuring the routes,
> this recreates the gesture locally.

`lib/nav.ts` is a hand-rolled stack replacement: `goBack` with a fallback because
`router.back()` no-ops on an empty stack, `goBackTo` that *replaces* because
"`router.back()` pops the tab history rather than the screen you actually arrived
from", plus a `FromTab` union, a `FROM_ROUTES` map, and a `?from=` query param
threaded through seven push sites.

Two concrete bugs follow directly:

- `messages/[id].tsx:220` calls bare `router.back()` while every other screen uses
  the `?from=` convention, and `requests.tsx:585` pushes to it without a `from`
  param. Back from a conversation has nothing correct to resolve to.
- `u/[id].tsx:214` hardcodes `?from=feed`. Opening a listing from someone's
  profile and pressing back lands on the feed rather than that profile.

Separately, the ⋯ menu on `u/[id].tsx:131-137` is `position: 'absolute'` with
`top: S.screenTop`. Taken out of normal flow, it pins 12pt from the top of its
container while every sibling sits materially lower — the `FlatList` adds
`paddingTop: S.screenTop` and its header `View` adds another `padding: 10`. The
result reads as a control floating near the notch, misaligned with everything
around it. (The screen does wrap in `SafeAreaView edges={['top']}`; the problem
is the absolute positioning, not a missing inset.) Moving it into
`<ScreenHeader>`'s right slot as an ordinary flex child removes the question
entirely, since it then aligns with the back chevron by construction.

## Decisions

1. **Pushed screens cover the tab bar.** Full-screen push, tab bar hidden,
   marketplace-style. This matches what `messages/[id]` already does by hand.
2. **A shared custom header, not the native one.** Preserves the existing
   Figtree/cardinal look and centralises safe-area handling.
3. **Cold deep links synthesize a stack.** Seed the parent, then push the target,
   so back pops and animates instead of jumping.

## Design

### Route structure

Detail routes become root-level siblings of `(tabs)`. The root layout already
renders a `<Stack>` (`app/_layout.tsx:67`), so they are pushed over the tabs with
no new layout file.

```
app/
  _layout.tsx              Stack — animation: slide_from_right, gestureEnabled: true
  (auth)/ …                unchanged
  (onboarding)/ …          unchanged
  (tabs)/
    _layout.tsx            only five real tabs remain
    feed · requests · post · notifications · profile
  listing/[id]/index.tsx   pushed
  listing/[id]/edit.tsx    pushed
  u/[id].tsx               pushed
  messages/[id].tsx        pushed
  saved.tsx                pushed
  reviews.tsx              pushed
  my-listings.tsx          pushed
  edit-profile.tsx         pushed
  terms.tsx · privacy.tsx · support.tsx   pushed
```

URLs shorten from `/(tabs)/listing/abc` to `/listing/abc`. `experiments.typedRoutes`
is enabled in `app.json`, so every stale route string fails at compile time rather
than at runtime on a device.

### `<ScreenHeader>`

One new component, `src/components/ScreenHeader.tsx`:

```tsx
type Props = {
  title?: string;
  right?: ReactNode;      // ⋯ menu, Edit, Save
  onBack?: () => void;    // defaults to router.back()
};
```

It owns `SafeAreaView edges={['top']}` plus the `S.screenTop` gap, a
`chevron-left` with generous `hitSlop`, and the title in Figtree. No screen
computes its own top inset again, which makes the `u/[id]` notch bug structurally
impossible rather than merely fixed.

### `lib/nav.ts`

Deleted: `goBackTo`, `backTarget`, `FromTab`, `FROM_ROUTES`, and all seven
`?from=` params.

Kept:

- `goBack` — reduces to `router.back()`. Still used by `(auth)/email.tsx` and
  `(auth)/verify.tsx`, which are already stack screens.
- `leaveAfterDelete` — unchanged. Going *back* after deleting a listing would
  return to that listing's detail screen, which then renders "not found".

Added: `parentOf(route)`, a pure function mapping a deep-linked route to its
conceptual parent — listing → feed, messages → requests, `u/[id]` → feed.

### Deep-link seeding

Cold starts arrive with an empty stack: a push notification opens a listing, or a
link opens a conversation. In the notification handler in `app/_layout.tsx`, and
anywhere a deep link resolves:

```
if (!router.canGoBack()) {
  router.replace(parentOf(target));
  router.push(target);
}
```

Back then pops with a real animation instead of replacing.

### Deletions

`src/components/EdgeSwipeBackGesture.tsx` and `src/components/EdgeSwipeBack.tsx`
(the lazy wrapper) are removed, along with their two consumers in
`edit-profile.tsx` and `listing/[id]/index.tsx`. The native stack gesture replaces
both.

## File-by-file changes

**Moved out of `(tabs)`** — 11 screens: `listing/[id]/index.tsx`,
`listing/[id]/edit.tsx`, `u/[id].tsx`, `messages/[id].tsx`, `edit-profile.tsx`,
`saved.tsx`, `reviews.tsx`, `my-listings.tsx`, `terms.tsx`, `privacy.tsx`,
`support.tsx`.

**Edited:**

- `app/(tabs)/_layout.tsx` — drop all eleven `href: null` entries.
- `app/_layout.tsx` — stack `screenOptions`; deep-link seeding in the
  notification listener.
- `lib/nav.ts` — as above.
- Seven push sites lose `?from=`: `feed.tsx:313`, `saved.tsx:101`,
  `my-listings.tsx:137`, `notifications.tsx:99`, `requests.tsx:627`,
  `profile.tsx:189`, `u/[id].tsx:214`.
- Back controls live in 8 files across 11 call sites. Header controls are
  replaced by `<ScreenHeader>`: `saved.tsx`, `my-listings.tsx`,
  `edit-profile.tsx`, `listing/[id]/index.tsx`, `reviews.tsx`,
  `messages/[id].tsx`, and `components/LegalScreen.tsx` (which serves `terms`,
  `privacy`, and `support`). Two of the 11 sites are footer *cancel* links, not
  headers — `edit-profile.tsx:311` and `listing/[id]/edit.tsx:344` — which keep
  their position. The edit-profile one becomes `router.back()`; the listing-edit
  one keeps `goBack` with a corrected route, since a cold-linked edit screen
  should still land on its listing.
- `u/[id].tsx` — adopt `<ScreenHeader>`, which fixes the ⋯ position. It has no
  back control today at all.
- `(auth)/email.tsx` and `(auth)/verify.tsx` keep `goBack` with its fallback.
  They are already stack screens and are untouched by this work.
- `components/LegalScreen.tsx` — route strings.
- 46 `(tabs)/` route strings across 18 files, compiler-checked.

**Deleted:** `EdgeSwipeBackGesture.tsx`, `EdgeSwipeBack.tsx`.

## Bugs this closes

1. Swipe-back works on every pushed screen, natively.
2. Every pushed screen has a back chevron in a consistent position.
3. Openings animate.
4. Back from a conversation returns to its opener.
5. Opening a second conversation never shows the first — each push mounts a
   distinct screen instance keyed by params.
6. Back from a listing opened on a profile returns to that profile.
7. The ⋯ menu on `u/[id]` clears the Dynamic Island.

## Verification

The mobile package has no test runner, so this is a manual device matrix rather
than an automated suite. Each row is checked with **both** the back chevron and
the edge swipe:

| Entry point | Expected back destination |
| --- | --- |
| Feed → listing | Feed, scroll position kept |
| Profile → listing | That profile |
| Someone's profile → their listing | That profile, not the feed |
| Saved → listing | Saved |
| Notifications → listing | Notifications |
| Requests → listing | Requests |
| Requests → conversation | Requests |
| Conversation → listing → back ×2 | Conversation, then Requests |
| Conversation A → back → conversation B | B renders immediately; A never flashes |
| Profile → Saved / Reviews / My listings / Edit profile | Profile |
| Cold start from push notification → listing | Feed, animated |
| Delete a listing from its detail screen | Leaves; back never returns to it |

Also confirmed: the tab bar is hidden on every pushed screen and restored on pop;
Android hardware back matches the chevron everywhere.

## Out of scope

Follow-up projects, each with its own spec:

- **B — perceived speed:** pass data already held by the list into the detail
  screen so it paints instantly instead of showing a spinner.
- **C — layout fixes:** remove the Go button on the code screen, reposition the ⋯
  menu, move "open to offers" under price and above description.
- **D — maps on listings:** reuse `MapPreview` on listing detail.
- **E — required post fields:** decide the rules, apply to mobile and web.
