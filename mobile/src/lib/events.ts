// Popup (event) listings. Ported from the web app's lib/validation.ts so both
// clients build and read the same event window — a popup is just a listing in
// the 'event' category carrying an event_start/event_end pair.

/** The category id that makes a listing a popup. Mirrors the web's isPopup. */
export const POPUP_CATEGORY = 'event';

export function isPopupCategory(category: string | null | undefined): boolean {
  return category === POPUP_CATEGORY;
}

/**
 * Combine a YYYY-MM-DD date with HH:MM start/end into ISO strings. Same-day
 * only: end must be strictly after start, else null (never a partial window).
 */
export function parseEventWindow(
  date: string,
  start: string,
  end: string,
): { start: string; end: string } | null {
  if (!date?.trim() || !start?.trim() || !end?.trim()) return null;
  const s = new Date(`${date}T${start}`);
  const e = new Date(`${date}T${end}`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  if (e.getTime() <= s.getTime()) return null;
  return { start: s.toISOString(), end: e.toISOString() };
}

/** "Sat, Mar 8 · 2:00 PM – 5:00 PM" — the pill shown on a popup listing. */
export function formatEventWindow(startIso: string, endIso: string): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return '';
  const day = s.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const t = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${t(s)} – ${t(e)}`;
}

/** Loose shape checks so the form can flag a bad field before submitting. */
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
