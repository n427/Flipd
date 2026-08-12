import { router } from 'expo-router';
import { parentOf } from './parentOf';

type Target = Parameters<typeof router.push>[0];
type Replacement = Parameters<typeof router.replace>[0];

/**
 * Go back, with a guaranteed destination.
 *
 * Still used by the (auth) screens and the listing edit screen, which can be
 * entered cold — `router.back()` is a no-op on an empty stack, so the button
 * would render and do nothing.
 *
 * Screens that can only be reached by a push use `router.back()` directly.
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
