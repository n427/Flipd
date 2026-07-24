// Pure helpers shared by API routes and the client store. No imports — keep
// this file dependency-free so it stays trivially unit-testable.

export type RevealStatus = 'pending' | 'approved' | 'declined' | 'expired' | 'completed';

// Should we nudge the seller to zoom? True when the photo is enough wider or
// taller than the crop frame that cover-fitting it leaves bars / cuts off a
// lot, AND they haven't already zoomed enough to fill it.
//   photoAspect / zoom : measured w/h of the source, and current zoom (>=1)
//   frameAspect        : the crop tile's w/h (Flipd's tile is 1.05)
//   tolerance          : ignore photos within this ratio of the frame (1.1 lets
//                        near-square photos pass; 4:3 and wider are flagged)
export function shouldHintZoom(
  photoAspect: number | undefined | null,
  zoom: number,
  frameAspect = 1.05,
  tolerance = 1.1,
): boolean {
  if (!photoAspect || !Number.isFinite(photoAspect) || photoAspect <= 0) return false;
  // Mismatch in either orientation: wide photo in tallish frame, or vice-versa.
  const mismatch = Math.max(photoAspect / frameAspect, frameAspect / photoAspect);
  if (mismatch <= tolerance) return false;
  // Zoom needed to fill the frame's short axis. Once reached, the hint is moot.
  const fillScale = Math.max(photoAspect / frameAspect, frameAspect / photoAspect);
  return (zoom || 1) < fillScale - 0.05;
}

// Auto-zoom applied to a non-square photo on upload. Aspect ratio tells us the
// photo is off-shape but NOT how thick any baked-in bars are, so filling the
// frame outright (mismatch) tends to over-crop when the bars are thin. Instead
// we ease `strength` of the way from 1 toward the fill scale — trimming bars
// without eating much content; the seller finishes with the slider.
//   strength 0 = no auto-zoom, 1 = fill the frame completely.
// 1 (no zoom) when within tolerance of the frame, so square-ish photos are
// never scaled.
export function fillZoom(
  photoAspect: number | undefined | null,
  frameAspect = 1.05,
  tolerance = 1.1,
  max = 2.5,
  strength = 0.6,
): number {
  if (!photoAspect || !Number.isFinite(photoAspect) || photoAspect <= 0) return 1;
  const mismatch = Math.max(photoAspect / frameAspect, frameAspect / photoAspect);
  if (mismatch <= tolerance) return 1;
  const eased = 1 + (mismatch - 1) * strength;
  // Round to the slider's 0.05 step so the thumb lands on a real notch.
  return Math.min(max, Math.round(eased * 20) / 20);
}

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
