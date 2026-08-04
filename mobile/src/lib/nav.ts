import { router } from 'expo-router';

/**
 * Go back, with a guaranteed destination.
 *
 * `router.back()` is a no-op when nothing is on the stack, which is common in
 * this app: a push notification opens /requests directly, `router.replace()`
 * leaves nothing behind it, and deep links start cold. The button renders,
 * the tap does nothing, and the screen looks frozen.
 *
 * `fallback` is where to land in that case — pass the screen that is
 * conceptually "up" one level from here.
 */
export function goBack(fallback: Parameters<typeof router.replace>[0] = '/(tabs)/feed') {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback);
}

/**
 * Tabs a screen can be opened from. Screens reachable from several places
 * (a listing opens from the feed, Requests, Saved, Notifications, a profile…)
 * take a `from` param so the back button returns to the right one instead of
 * dumping everyone on the feed.
 */
export type FromTab = 'feed' | 'requests' | 'notifications' | 'saved' | 'profile' | 'my-listings';

const FROM_ROUTES: Record<FromTab, string> = {
  feed: '/(tabs)/feed',
  requests: '/(tabs)/requests',
  notifications: '/(tabs)/notifications',
  saved: '/(tabs)/saved',
  profile: '/(tabs)/profile',
  'my-listings': '/(tabs)/my-listings',
};

/**
 * Back destination for a screen opened with `?from=`. Falls back to the feed
 * when the param is absent or unrecognised (an old deep link, a hand-typed
 * URL), so this can never resolve to a dead route.
 */
export function backTarget(from: string | undefined): Parameters<typeof router.replace>[0] {
  const route = from && FROM_ROUTES[from as FromTab];
  return (route ?? '/(tabs)/feed') as Parameters<typeof router.replace>[0];
}

/**
 * Leave a screen whose subject no longer exists — a deleted listing, a
 * cancelled draft.
 *
 * Distinct from goBack() on purpose: going *back* after a delete can return to
 * the detail screen of the thing just deleted, which then renders "not found".
 * This always replaces, so the dead screen leaves the stack entirely.
 */
export function leaveAfterDelete(destination: Parameters<typeof router.replace>[0] = '/(tabs)/feed') {
  router.replace(destination);
}
