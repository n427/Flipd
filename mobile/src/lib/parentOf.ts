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
