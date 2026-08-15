// Builds the PostgREST `or()` filter for a feed search.
//
// The term used to be interpolated straight into the filter string, which is a
// small grammar of its own: commas separate conditions and parentheses group
// them. Searching "desk, chair" therefore did not search for that phrase — it
// produced three malformed conditions. Quoting the value fixes it, so long as
// nothing in the term can close the quote.
//
// Pure and free of the supabase client so it is testable under the repo-root
// vitest, which runs in a node environment.

const COLUMNS = ['title', 'description'] as const;

export function orFilterForSearch(raw: string): string | null {
  const term = raw.trim();
  if (!term) return null;

  // % and _ are LIKE operators. A user typing them means the characters, and
  // an unescaped % would match everything.
  // Quotes and backslashes are dropped rather than escaped: they would end the
  // quoted value, and no one searches for them literally.
  const literal = term.replace(/[%_]/g, '').replace(/["\\]/g, '');
  if (!literal) return null;

  const value = `"%${literal}%"`;
  return COLUMNS.map((c) => `${c}.ilike.${value}`).join(',');
}
