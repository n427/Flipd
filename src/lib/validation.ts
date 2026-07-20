// Pure helpers shared by API routes and the client store. No imports — keep
// this file dependency-free so it stays trivially unit-testable.

export type RevealStatus = 'pending' | 'approved' | 'declined' | 'expired' | 'completed';

export function isUscEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  return /^[^\s@]+@usc\.edu$/.test(e);
}

// 72h expiry is computed at read time — a pending request past its
// expires_at is treated as expired everywhere (no cron).
export function effectiveRevealStatus(
  status: RevealStatus,
  expiresAt: string,
  now: Date = new Date(),
): RevealStatus {
  if (status === 'pending' && new Date(expiresAt).getTime() < now.getTime()) return 'expired';
  return status;
}

// Human countdown to an expiry timestamp: "71h left", "40m left", '' once past.
export function timeLeftLabel(expiresAt: string, now: Date = new Date()): string {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (ms <= 0) return '';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m left`;
  return `${Math.floor(mins / 60)}h left`;
}

type ContactValues = { instagram: string | null; phone: string | null; email: string | null };
export type ContactMethod = 'instagram' | 'phone' | 'email';
const METHOD_ORDER: ContactMethod[] = ['instagram', 'phone', 'email'];

// The methods actually shared = chosen ∩ (methods with a stored value).
export function resolveSharedContact(chosen: string[], values: ContactValues): Partial<Record<ContactMethod, string>> {
  const out: Partial<Record<ContactMethod, string>> = {};
  for (const m of METHOD_ORDER) {
    if (chosen.includes(m) && values[m]) out[m] = values[m] as string;
  }
  return out;
}

// First present method in priority order — used as the legacy "primary" hint.
export function primaryMethod(values: ContactValues): ContactMethod | null {
  return METHOD_ORDER.find((m) => Boolean(values[m])) ?? null;
}

// Coordinates: both must be finite and in geographic range, else null (never
// a partial pair). Accepts numbers or numeric strings (form-data values).
export function parseCoords(latRaw: unknown, lngRaw: unknown): { lat: number; lng: number } | null {
  // Treat blank/whitespace-only as missing (Number(' ') would be 0 = Null Island).
  const latBlank = latRaw === null || latRaw === undefined || (typeof latRaw === 'string' && latRaw.trim() === '');
  const lngBlank = lngRaw === null || lngRaw === undefined || (typeof lngRaw === 'string' && lngRaw.trim() === '');
  if (latBlank || lngBlank) return null;
  const lat = typeof latRaw === 'number' ? latRaw : Number(latRaw);
  const lng = typeof lngRaw === 'number' ? lngRaw : Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

// Known campus meetup spots (chip shortcuts drop the pin here).
export const CAMPUS_SPOTS: ReadonlyArray<{ name: string; lat: number; lng: number }> = [
  { name: 'USC Village', lat: 34.0259, lng: -118.2851 },
  { name: 'Leavey Library', lat: 34.0217, lng: -118.2828 },
  { name: 'Tutor Campus Center', lat: 34.0205, lng: -118.2860 },
];

// Combine a YYYY-MM-DD date with HH:MM start/end into ISO strings. Same-day
// only: end must be strictly after start, else null (never a partial window).
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

// Human label for an event window: "Fri, Jul 24 · 7:00 – 11:00 PM".
export function formatEventWindow(startIso: string, endIso: string): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return '';
  const day = s.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const t = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${t(s)} – ${t(e)}`;
}
