// Search capture for the daily listing-match digest.
//
// The search inputs on both clients fire per keystroke, so this cannot post
// directly from the change handler — typing "desk lamp" would be nine
// requests, eight of which describe a prefix nobody searched for. Capture is
// debounced to the pause after typing, which is also the point at which the
// text is a real query rather than a fragment.
//
// Nothing here is allowed to affect search itself: every call is
// fire-and-forget and every failure is swallowed. A dropped signal costs one
// marginally worse digest; a thrown error costs the user their search.

// Long enough that a normal typing pause ends the burst, short enough that a
// user who types and immediately clicks a result is still recorded.
export const CAPTURE_DEBOUNCE_MS = 900;

// One-character queries carry almost no interest signal and are mostly
// mid-word states from the debounce landing early.
export const MIN_CAPTURE_LENGTH = 2;

/**
 * Pure decision: is this query worth recording, given the last one recorded?
 * Split out from the timer so the interesting rules are testable without
 * faking clocks or the network.
 */
export function shouldCapture(query: string, lastCaptured: string | null): boolean {
  const q = (query ?? '').trim();
  if (q.length < MIN_CAPTURE_LENGTH) return false;
  // Case-insensitive: "Desk Lamp" right after "desk lamp" is the same intent,
  // usually a capitalisation fix rather than a new search.
  if (lastCaptured && q.toLowerCase() === lastCaptured.trim().toLowerCase()) return false;
  return true;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let lastCaptured: string | null = null;

/**
 * Call on every keystroke. Posts at most once per typing burst, and never for
 * a query identical to the one just recorded.
 */
export function captureSearch(query: string): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    if (!shouldCapture(query, lastCaptured)) return;
    lastCaptured = query.trim();
    // Deliberately not awaited. `credentials: 'include'` because the web app
    // authenticates by cookie session; the route resolves the user server-side
    // and ignores any client-supplied id.
    void fetch('/api/search-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ query: query.trim() }),
    }).catch(() => {});
  }, CAPTURE_DEBOUNCE_MS);
}

/** Test seam: clears the pending timer and the dedupe memory. */
export function resetCaptureState(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  lastCaptured = null;
}
