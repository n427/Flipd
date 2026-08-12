// Mobile counterpart to src/lib/digest/capture.ts on the web. Same rules —
// debounce to the pause after typing, skip fragments, skip exact repeats —
// but mobile authenticates with a bearer token rather than a cookie session,
// so it cannot share the web module.
//
// Every call is fire-and-forget. Recording a search must never delay, block,
// or fail a search.

import { API_BASE, requireToken } from './listings';

export const CAPTURE_DEBOUNCE_MS = 900;
export const MIN_CAPTURE_LENGTH = 2;

export function shouldCapture(query: string, lastCaptured: string | null): boolean {
  const q = (query ?? '').trim();
  if (q.length < MIN_CAPTURE_LENGTH) return false;
  if (lastCaptured && q.toLowerCase() === lastCaptured.trim().toLowerCase()) return false;
  return true;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let lastCaptured: string | null = null;

/** Call on every keystroke from the feed search box. */
export function captureSearch(query: string): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    if (!shouldCapture(query, lastCaptured)) return;
    lastCaptured = query.trim();

    // requireToken() throws when signed out. A signed-out user has no digest
    // to personalise, so that is a silent no-op rather than an error path.
    void (async () => {
      try {
        const token = await requireToken();
        await fetch(`${API_BASE}/api/search-events`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ query: query.trim() }),
        });
      } catch {
        // Swallowed on purpose — see the file header.
      }
    })();
  }, CAPTURE_DEBOUNCE_MS);
}
