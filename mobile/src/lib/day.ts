// Day bucketing for activity-style lists.
//
// Buckets are relative to the viewer's own clock, so the labels stay readable
// without anyone doing date math in their head: the last week reads as
// Today/Yesterday/weekday, and anything older falls back to a short date.

/** Midnight local time, so "yesterday" means the calendar day, not 24 hours. */
function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function dayBucket(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Earlier';
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  // Future timestamps (clock skew) read as Today rather than a stray label.
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Group already-sorted items into contiguous day sections. Input order is
 * preserved, so the caller's sort (newest first) decides section order too.
 */
export function groupByDay<T>(
  items: T[],
  getDate: (item: T) => string,
  now?: Date,
): { title: string; data: T[] }[] {
  const sections: { title: string; data: T[] }[] = [];
  for (const item of items) {
    const title = dayBucket(getDate(item), now);
    const last = sections[sections.length - 1];
    if (last && last.title === title) last.data.push(item);
    else sections.push({ title, data: [item] });
  }
  return sections;
}
