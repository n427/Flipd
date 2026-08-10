// Lives here rather than in the route module because a Next.js App Router
// `route.ts` may only export HTTP handlers and a small set of config fields
// (`dynamic`, `revalidate`, `runtime`, ...). Exporting a helper from one fails
// `next build` with "not a valid Route export field" — and `tsc --noEmit`
// does NOT catch it, because the rule is Next's, not TypeScript's.

// Queries feed a prompt, so bound them. 200 chars is far past any real search
// and short enough that 30 days of them stay a reasonable prompt size.
export const MAX_QUERY_LENGTH = 200;

// Takes unknown, not string: the value comes straight off a parsed JSON body,
// so `{"query": 123}` would otherwise reach .trim() and 500 the route.
export function normalizeQuery(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const q = raw.trim().replace(/\s+/g, ' ');
  if (!q) return null;
  return q.slice(0, MAX_QUERY_LENGTH);
}
