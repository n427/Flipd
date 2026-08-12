# Mobile Navigation Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the eleven detail screens out of the Tabs navigator into the root stack so every pushed screen slides in, swipes back, and returns to its opener.

**Architecture:** Detail routes become root-level siblings of `(tabs)`, pushed by the `<Stack>` already rendered in `app/_layout.tsx`. A single `<ScreenHeader>` owns the back affordance. Deep links seed a parent screen before pushing so back always pops. The hand-rolled swipe gesture and the `?from=` query-param convention are deleted.

**Tech Stack:** Expo SDK 54, expo-router 6, React Native 0.81, TypeScript 6, vitest (repo root only).

## Global Constraints

- Colours, spacing and fonts come from `@/lib/theme` (`T`, `S`, `F`). Never hardcode a hex value or a font name.
- `S.screenTop` is breathing room **inside** a `SafeAreaView edges={['top']}` — never a substitute for the inset. `<ScreenHeader>` renders inside the screen's existing `SafeAreaView`; it does not add one.
- `experiments.typedRoutes` is enabled, so `npx tsc --noEmit` catches every stale route string. It passes clean today — keep it that way at the end of every task.
- The five real tabs keep their `(tabs)` paths: `/(tabs)/feed`, `/(tabs)/requests`, `/(tabs)/post`, `/(tabs)/notifications`, `/(tabs)/profile`.
- Moved screens lose the `(tabs)` segment: `/listing/[id]`, `/u/[id]`, `/messages/[id]`, `/saved`, `/reviews`, `/my-listings`, `/edit-profile`, `/terms`, `/privacy`, `/support`.
- Use `git mv` for file moves so history follows the file.
- The mobile package has no test runner. Only Task 1 has automated tests; every other task is gated by `npx tsc --noEmit` plus the device checks in Task 8.

---

### Task 1: `parentOf` — pure parent-route resolution

Pure and dependency-free on purpose: no `expo-router` import, so the repo-root vitest (node environment) can test it without React Native.

**Files:**
- Create: `mobile/src/lib/parentOf.ts`
- Create: `mobile/src/lib/parentOf.test.ts`
- Modify: `vitest.config.ts` (repo root)

**Interfaces:**
- Consumes: nothing.
- Produces: `parentOf(route: string): string` — returns the tab route a deep-linked screen should sit on top of. Task 6 imports it into `lib/nav.ts`.

- [ ] **Step 1: Widen the root vitest include**

In `vitest.config.ts`, change the `include` line to:

```ts
    include: ['src/**/*.test.ts', 'mobile/src/**/*.test.ts'],
```

- [ ] **Step 2: Write the failing test**

Create `mobile/src/lib/parentOf.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parentOf } from './parentOf';

describe('parentOf', () => {
  it('sends a listing back to the feed', () => {
    expect(parentOf('/listing/abc123')).toBe('/(tabs)/feed');
  });

  it('sends a conversation back to requests', () => {
    expect(parentOf('/messages/thread-1')).toBe('/(tabs)/requests');
  });

  it('sends a public profile back to the feed', () => {
    expect(parentOf('/u/user-9')).toBe('/(tabs)/feed');
  });

  it('sends profile sub-screens back to profile', () => {
    expect(parentOf('/saved')).toBe('/(tabs)/profile');
    expect(parentOf('/reviews')).toBe('/(tabs)/profile');
    expect(parentOf('/my-listings')).toBe('/(tabs)/profile');
    expect(parentOf('/edit-profile')).toBe('/(tabs)/profile');
  });

  it('sends legal pages back to profile', () => {
    expect(parentOf('/terms')).toBe('/(tabs)/profile');
    expect(parentOf('/privacy')).toBe('/(tabs)/profile');
    expect(parentOf('/support')).toBe('/(tabs)/profile');
  });

  it('ignores a query string', () => {
    expect(parentOf('/listing/abc123?ref=push')).toBe('/(tabs)/feed');
  });

  it('falls back to the feed for an unrecognised route', () => {
    expect(parentOf('/nonsense')).toBe('/(tabs)/feed');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run from the repo root: `npx vitest run mobile/src/lib/parentOf.test.ts`
Expected: FAIL — `Failed to resolve import "./parentOf"`.

- [ ] **Step 4: Write the implementation**

Create `mobile/src/lib/parentOf.ts`:

```ts
// The screen a deep-linked route sits on top of.
//
// A push notification or cold link opens a detail screen with nothing behind
// it. Seeding this parent first means back pops with a real animation instead
// of replacing the screen out from under the user.
//
// Deliberately pure — no expo-router import — so it is unit-testable under the
// repo-root vitest, which runs in a node environment.

const FEED = '/(tabs)/feed';
const REQUESTS = '/(tabs)/requests';
const PROFILE = '/(tabs)/profile';

const RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^\/listing\//, FEED],
  [/^\/u\//, FEED],
  [/^\/messages\//, REQUESTS],
  [/^\/(saved|reviews|my-listings|edit-profile)$/, PROFILE],
  [/^\/(terms|privacy|support)$/, PROFILE],
];

export function parentOf(route: string): string {
  const path = route.split('?')[0];
  for (const [pattern, parent] of RULES) {
    if (pattern.test(path)) return parent;
  }
  return FEED;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run mobile/src/lib/parentOf.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts mobile/src/lib/parentOf.ts mobile/src/lib/parentOf.test.ts
git commit -m "feat(mobile): add pure parentOf route resolution with tests"
```

---

### Task 2: `<ScreenHeader>` component

**Files:**
- Create: `mobile/src/components/ScreenHeader.tsx`

**Interfaces:**
- Consumes: `T`, `S`, `F` from `@/lib/theme`.
- Produces: `<ScreenHeader title?: string right?: ReactNode onBack?: () => void />`. Tasks 3, 4 and 5 render it as the first child inside each screen's existing `SafeAreaView`.

- [ ] **Step 1: Create the component**

Create `mobile/src/components/ScreenHeader.tsx`:

```tsx
import { ReactNode } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { T, F, S } from '@/lib/theme';

/**
 * The single header for pushed screens.
 *
 * Owns the back affordance so no screen hand-rolls one again, and standardises
 * on Feather's chevron-left (screens previously mixed Feather and Ionicons).
 *
 * Renders INSIDE the screen's existing `SafeAreaView edges={['top']}` — it does
 * not add one, and it does not apply the top inset itself. `S.screenTop` here
 * is the breathing room below that inset, per the contract in theme.ts.
 *
 * Large page titles stay in the scroll content where they already live, so they
 * still scroll away. Pass `title` only when a screen wants it pinned in the bar.
 */
export function ScreenHeader({
  title,
  right,
  onBack,
}: {
  title?: string;
  right?: ReactNode;
  onBack?: () => void;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: S.gutter,
        paddingTop: S.screenTop,
        paddingBottom: 12,
      }}
    >
      <Pressable
        onPress={onBack ?? (() => router.back())}
        hitSlop={10}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
      >
        <Feather name="chevron-left" size={20} color={T.muted} />
        <Text style={{ fontFamily: F.medium, fontSize: 15, color: T.muted }}>Back</Text>
      </Pressable>

      {title ? (
        <Text
          numberOfLines={1}
          style={{ flex: 1, marginLeft: 8, fontFamily: F.bold, fontSize: 16, color: T.ink }}
        >
          {title}
        </Text>
      ) : (
        <View style={{ flex: 1 }} />
      )}

      {right ?? null}
    </View>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/ScreenHeader.tsx
git commit -m "feat(mobile): add shared ScreenHeader for pushed screens"
```

---

### Task 3: Root stack options + move the seven leaf screens

Moves the screens with no `?from=` threading and no `EdgeSwipeBack` usage, so the mechanical route change lands before the trickier screens.

**Files:**
- Modify: `mobile/src/app/_layout.tsx:67`
- Modify: `mobile/src/app/(tabs)/_layout.tsx:110-124`
- Move: `(tabs)/saved.tsx` → `saved.tsx`; `(tabs)/reviews.tsx` → `reviews.tsx`; `(tabs)/my-listings.tsx` → `my-listings.tsx`; `(tabs)/edit-profile.tsx` → `edit-profile.tsx`; `(tabs)/terms.tsx` → `terms.tsx`; `(tabs)/privacy.tsx` → `privacy.tsx`; `(tabs)/support.tsx` → `support.tsx`
- Modify: `mobile/src/components/LegalScreen.tsx`
- Modify: `mobile/src/app/(tabs)/profile.tsx:141,156,157,173,194,195,196`

**Interfaces:**
- Consumes: `<ScreenHeader>` from Task 2.
- Produces: routes `/saved`, `/reviews`, `/my-listings`, `/edit-profile`, `/terms`, `/privacy`, `/support`.

- [ ] **Step 1: Give the root stack push behaviour**

In `mobile/src/app/_layout.tsx`, replace line 67:

```tsx
  return <Stack screenOptions={{ headerShown: false }} />;
```

with:

```tsx
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        gestureEnabled: true,
        // iOS: let the drag start anywhere, not just the 20pt edge. This is the
        // "swipe back should work everywhere" behaviour the hand-rolled gesture
        // was approximating.
        fullScreenGestureEnabled: true,
      }}
    />
  );
```

- [ ] **Step 2: Move the seven files**

```bash
cd mobile/src/app
git mv "(tabs)/saved.tsx" saved.tsx
git mv "(tabs)/reviews.tsx" reviews.tsx
git mv "(tabs)/my-listings.tsx" my-listings.tsx
git mv "(tabs)/edit-profile.tsx" edit-profile.tsx
git mv "(tabs)/terms.tsx" terms.tsx
git mv "(tabs)/privacy.tsx" privacy.tsx
git mv "(tabs)/support.tsx" support.tsx
```

- [ ] **Step 3: Drop their tab registrations**

In `mobile/src/app/(tabs)/_layout.tsx`, delete these lines:

```tsx
      <Tabs.Screen name="saved" options={{ href: null }} />
      <Tabs.Screen name="reviews" options={{ href: null }} />
      <Tabs.Screen name="my-listings" options={{ href: null }} />
      <Tabs.Screen name="edit-profile" options={{ href: null }} />
      <Tabs.Screen name="terms" options={{ href: null }} />
      <Tabs.Screen name="privacy" options={{ href: null }} />
      <Tabs.Screen name="support" options={{ href: null }} />
```

Leave the `listing/[id]/…`, `u/[id]` and `messages/[id]` entries for now — Tasks 4 and 5 remove those.

- [ ] **Step 4: Point `profile.tsx` at the new routes**

In `mobile/src/app/(tabs)/profile.tsx`, update the six pushes:

```tsx
onPress={() => router.push('/edit-profile')}
onPress={() => router.push('/saved')}
onPress={() => router.push('/reviews')}
onPress={() => router.push('/my-listings')}
onPress={() => router.push('/support')}
onPress={() => router.push('/terms')}
onPress={() => router.push('/privacy')}
```

- [ ] **Step 5: Replace the hand-rolled headers**

In `saved.tsx`, delete the `<Pressable>` back block inside `ListHeaderComponent` (the one wrapping `Feather name="chevron-left"` plus the `Back` text, and its two-line comment about `router.back()` popping tab history). Keep the `Saved` title `<Text>`. Then render the header above the list — change the wrapper to:

```tsx
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
      <ScreenHeader />
      <FlatList
```

Add the import: `import { ScreenHeader } from '@/components/ScreenHeader';`
Remove the now-unused `goBackTo` import and, if nothing else uses them, the `Pressable` and `Feather` imports.

`my-listings.tsx` (back `<Pressable>` at line 83) and `reviews.tsx` each get the identical
treatment — do not skim this because it repeats:

1. Delete the back `<Pressable>` block, including its chevron icon and `Back` text.
2. Add `<ScreenHeader />` as the first child of the screen's `SafeAreaView`, immediately
   before the `FlatList`.
3. Add `import { ScreenHeader } from '@/components/ScreenHeader';`
4. Delete the now-unused `goBack` / `goBackTo` import, plus `Pressable` and the icon
   import if nothing else in the file uses them.

`edit-profile.tsx` gets those four edits **plus** two more:

5. Remove the `<EdgeSwipeBack onBack={…}>` wrapper and its closing tag (lines 152 and
   316), leaving the children in place.
6. Change both remaining `goBackTo('/(tabs)/profile')` calls — the post-save one at
   line 125 and the footer cancel link at line 311 — to `router.back()`. The stack
   returns to Profile because that is where the screen was pushed from.

In `components/LegalScreen.tsx`, replace the back `<Pressable>` with `<ScreenHeader />` and delete the `goBackTo` import.

- [ ] **Step 6: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors. Any error naming `/(tabs)/saved`-style paths means a route string was missed — fix it and re-run.

- [ ] **Step 7: Lint**

Run: `cd mobile && npm run lint`
Expected: no new errors. Unused-import warnings mean Step 5 left a stale import behind.

- [ ] **Step 8: Commit**

```bash
git add -A mobile/src
git commit -m "refactor(mobile): push the seven leaf screens from the root stack"
```

---

### Task 4: Move the listing screens and delete `?from=`

**Files:**
- Move: `(tabs)/listing/[id]/index.tsx` → `listing/[id]/index.tsx`; `(tabs)/listing/[id]/edit.tsx` → `listing/[id]/edit.tsx`
- Modify: `mobile/src/app/(tabs)/_layout.tsx`
- Modify: `feed.tsx:313`, `saved.tsx:101`, `my-listings.tsx:137`, `notifications.tsx:99`, `requests.tsx:627`, `profile.tsx:189`, `u/[id].tsx:214`

**Interfaces:**
- Consumes: `<ScreenHeader>` from Task 2.
- Produces: route `/listing/[id]` taking **no** `from` param.

- [ ] **Step 1: Move the files**

```bash
cd mobile/src/app
git mv "(tabs)/listing" listing
```

- [ ] **Step 2: Drop the tab registrations**

In `(tabs)/_layout.tsx`, delete:

```tsx
      <Tabs.Screen name="listing/[id]/index" options={{ href: null }} />
      <Tabs.Screen name="listing/[id]/edit" options={{ href: null }} />
```

- [ ] **Step 3: Strip `?from=` from all seven push sites**

Each becomes the same shape — the param is gone because the stack now knows where the user came from:

```tsx
// feed.tsx:313, saved.tsx:101, my-listings.tsx:137, profile.tsx:189, u/[id].tsx:214
<ListingCard listing={item} onPress={() => router.push(`/listing/${item.id}`)} />

// notifications.tsx:99
onPress={() => router.push(`/listing/${item.id}`)}

// requests.tsx:627
onPress={() => router.push(`/listing/${item.listing_id}`)}
```

Note `u/[id].tsx:214` currently hardcodes `?from=feed`, which is the bug where backing out of a listing opened from someone's profile dumped you on the feed. Removing the param fixes it.

- [ ] **Step 4: Replace the listing header**

In `listing/[id]/index.tsx`:
- Remove the `<EdgeSwipeBack onBack={() => goBackTo(backTarget(from))}>` wrapper and its closing tag (lines 260 and 608), keeping the children.
- Replace the header back `<Pressable>` (which calls `goBackTo(backTarget(from))`) with `<ScreenHeader />`.
- Delete the `from` route param read, and the `goBackTo` / `backTarget` / `EdgeSwipeBack` imports.
- Add `import { ScreenHeader } from '@/components/ScreenHeader';`

`listing/[id]/edit.tsx` has **two** `goBack` call sites, and both keep `goBack` — its
pop-or-fallback behaviour is still right here, since a cold-linked edit screen should
land on the listing. Only the route string changes:

```tsx
// line 168 — after a successful save
goBack(`/listing/${id}`);

// line 344 — the footer cancel link
<Pressable onPress={() => goBack(`/listing/${id}`)} style={{ marginTop: 14, alignItems: 'center' }}>
```

Keep the `goBack` import in this file.

- [ ] **Step 5: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add -A mobile/src
git commit -m "refactor(mobile): push listing screens, drop the ?from= convention"
```

---

### Task 5: Move the profile and conversation screens

**Files:**
- Move: `(tabs)/u/[id].tsx` → `u/[id].tsx`; `(tabs)/messages/[id].tsx` → `messages/[id].tsx`
- Modify: `mobile/src/app/(tabs)/_layout.tsx`
- Modify: `requests.tsx:585,636`

**Interfaces:**
- Consumes: `<ScreenHeader>` from Task 2.
- Produces: routes `/u/[id]` and `/messages/[id]`.

- [ ] **Step 1: Move the files**

```bash
cd mobile/src/app
git mv "(tabs)/u" u
git mv "(tabs)/messages" messages
```

- [ ] **Step 2: Drop the tab registrations**

In `(tabs)/_layout.tsx`, delete the `u/[id]` entry and the `messages/[id]` entry together with its three-line comment about hiding the tab bar — the bar is no longer rendered over pushed screens, so the workaround is obsolete. `(tabs)/_layout.tsx` should now register exactly five screens.

- [ ] **Step 3: Update the pushes in `requests.tsx`**

```tsx
// line 585
onPress={() => router.push(`/messages/${item.id}`)}
// line 636
onOpenChat={(threadId) => router.push(`/messages/${threadId}`)}
```

- [ ] **Step 4: Move the ⋯ into the header**

In `u/[id].tsx`, delete the absolutely-positioned menu block:

```tsx
        {!isSelf ? (
          <Pressable
            onPress={() => setSheet('menu')}
            hitSlop={10}
            style={{ position: 'absolute', top: S.screenTop, right: 18, zIndex: 10, padding: 4 }}
          >
            <Ionicons name="ellipsis-horizontal" size={22} color={T.ink} />
          </Pressable>
        ) : null}
```

and render it through the header instead, as the first child of the `SafeAreaView`:

```tsx
      <ScreenHeader
        right={
          !isSelf ? (
            <Pressable onPress={() => setSheet('menu')} hitSlop={10} style={{ padding: 4 }}>
              <Ionicons name="ellipsis-horizontal" size={22} color={T.ink} />
            </Pressable>
          ) : null
        }
      />
```

As an ordinary flex child it aligns with the back chevron by construction, which is the fix for it sitting too high. Add the `ScreenHeader` import.

- [ ] **Step 5: Replace the conversation header**

In `messages/[id].tsx`, replace the back `<Pressable>` at line 220 (the `Ionicons name="chevron-back"` block calling bare `router.back()`) with `<ScreenHeader />`, moved to sit directly inside the `SafeAreaView` and above the `KeyboardAvoidingView`. Keep the pinned listing card below it. Update the listing push on line 233 to `` router.push(`/listing/${head.listing_id}`) ``. Add the `ScreenHeader` import.

- [ ] **Step 6: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add -A mobile/src
git commit -m "refactor(mobile): push profile and conversation screens"
```

---

### Task 6: Delete the workarounds and prune `nav.ts`

**Files:**
- Delete: `mobile/src/components/EdgeSwipeBack.tsx`, `mobile/src/components/EdgeSwipeBackGesture.tsx`
- Modify: `mobile/src/lib/nav.ts`

**Interfaces:**
- Consumes: `parentOf` from Task 1.
- Produces: `goBack(fallback?)`, `leaveAfterDelete(destination?)`, `openDeepLink(target)`. Task 7 calls `openDeepLink`.

- [ ] **Step 1: Confirm nothing imports the gesture**

Run: `cd mobile && grep -rn "EdgeSwipeBack" src`
Expected: only the two component files themselves. Any screen hit means Task 3 or 4 missed a wrapper — fix that first.

- [ ] **Step 2: Delete both files**

```bash
git rm mobile/src/components/EdgeSwipeBack.tsx mobile/src/components/EdgeSwipeBackGesture.tsx
```

- [ ] **Step 3: Rewrite `nav.ts`**

Replace the whole file with:

```ts
import { router } from 'expo-router';
import { parentOf } from './parentOf';

type Target = Parameters<typeof router.push>[0];
type Replacement = Parameters<typeof router.replace>[0];

/**
 * Go back, with a guaranteed destination.
 *
 * Still used by the (auth) screens, which can be entered cold — `router.back()`
 * is a no-op on an empty stack and the button would look frozen.
 */
export function goBack(fallback: Replacement = '/(tabs)/feed') {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback);
}

/**
 * Leave a screen whose subject no longer exists — a deleted listing, a
 * cancelled draft.
 *
 * Distinct from goBack() on purpose: going *back* after a delete can return to
 * the detail screen of the thing just deleted, which then renders "not found".
 * This always replaces, so the dead screen leaves the stack entirely.
 */
export function leaveAfterDelete(destination: Replacement = '/(tabs)/feed') {
  router.replace(destination);
}

/**
 * Open a deep-linked screen with something behind it.
 *
 * A push notification or cold link arrives with an empty stack. Seeding the
 * parent first means back pops and animates like any other screen, instead of
 * replacing out from under the user.
 */
export function openDeepLink(target: Target) {
  if (!router.canGoBack()) {
    router.replace(parentOf(String(target)) as Replacement);
  }
  router.push(target);
}
```

`goBackTo`, `backTarget`, `FromTab` and `FROM_ROUTES` are gone — the stack answers those questions now.

- [ ] **Step 4: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors. An error about a missing `goBackTo` export means a screen still imports it — replace that call with `router.back()`.

- [ ] **Step 5: Commit**

```bash
git add -A mobile/src
git commit -m "refactor(mobile): delete the hand-rolled swipe gesture and ?from= helpers"
```

---

### Task 7: Seed a parent on deep links

**Files:**
- Modify: `mobile/src/app/_layout.tsx:57-65`

**Interfaces:**
- Consumes: `openDeepLink` from Task 6.

- [ ] **Step 1: Route notification taps through `openDeepLink`**

In `mobile/src/app/_layout.tsx`, replace the notification listener body:

```tsx
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const type = res.notification.request.content.data?.type;
      if (type === 'new_request' || type === 'approval') {
        router.push('/(tabs)/requests');
      }
    });
    return () => sub.remove();
  }, [router]);
```

with:

```tsx
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const data = res.notification.request.content.data;
      if (data?.type === 'new_request' || data?.type === 'approval') {
        openDeepLink('/(tabs)/requests');
      }
    });
    return () => sub.remove();
  }, []);
```

Add the import: `import { openDeepLink } from '@/lib/nav';`

`openDeepLink` uses the imported `router` singleton rather than the hook, so `router` leaves the dependency array.

- [ ] **Step 2: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/app/_layout.tsx
git commit -m "feat(mobile): seed a parent screen on deep links"
```

---

### Task 8: Device verification

No automated coverage exists for navigation, so this matrix is the gate. Run it on the physical iPhone against the development build.

**Files:** none — verification only.

- [ ] **Step 1: Start the dev server**

```bash
cd mobile && npx expo start --dev-client --clear
```

- [ ] **Step 2: Walk the matrix**

Check each row with **both** the back chevron and an edge swipe:

| Entry point | Expected back destination |
| --- | --- |
| Feed → listing | Feed, scroll position kept |
| Profile → listing | Profile |
| Someone's profile → their listing | That profile, **not** the feed |
| Saved → listing | Saved |
| Notifications → listing | Notifications |
| Requests → listing | Requests |
| Requests → conversation | Requests |
| Conversation → listing → back ×2 | Conversation, then Requests |
| Conversation A → back → conversation B | B renders immediately; A never flashes |
| Profile → Saved / Reviews / My listings / Edit profile | Profile |
| Profile → Terms / Privacy / Support | Profile |
| Cold start from a push notification | Requests, animated, back reaches the feed |
| Delete a listing from its detail screen | Leaves; back never returns to it |

- [ ] **Step 3: Check the details that regress quietly**

- The tab bar is hidden on every pushed screen and back on every tab.
- The ⋯ on someone's profile aligns with the back chevron, clear of the Dynamic Island.
- Android hardware back matches the chevron on every screen.
- The large titles on Saved / My listings / Reviews still scroll away under the fixed header.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A mobile/src
git commit -m "fix(mobile): address device verification findings"
```

---

## Out of scope

Follow-up projects, each needing its own spec:

- **B — perceived speed:** pass list data into the detail screen so it paints without a spinner.
- **C — layout fixes:** remove the Go button on the code screen, move "open to offers" under price.
- **D — maps on listings:** reuse `MapPreview` on listing detail.
- **E — required post fields:** decide the rules, apply to mobile and web.
