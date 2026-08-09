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

// TEMP TEST ALLOW-LIST: USC's Proofpoint filter silently drops the auth
// emails, so this one address is allowed through for testing while USC
// deliverability is sorted. Mirrors TEST_ALLOW in mobile/src/lib/usc.ts and
// the allow-list in migration 022_usc_test_allowlist.sql — all three have to
// agree, or sign-in fails at whichever layer is strictest.
// Remove from all three once USC email delivery works.
const TEST_ALLOW = new Set(['nicolexzha@gmail.com']);

export function isUscEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  if (TEST_ALLOW.has(e)) return true;
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

// Human label for a start time only, no range: "Fri, Aug 9 · 3:00 PM". For
// callers that only have (or only trust) event_start — pairing it with a
// synthesized end time would read as a bug ("3:00 PM – 3:00 PM").
export function formatEventStart(startIso: string): string {
  const s = new Date(startIso);
  if (Number.isNaN(s.getTime())) return '';
  const day = s.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const t = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${t(s)}`;
}

// ── Intro-message contact filter ─────────────────────────────────────
// Buyers attach a short intro message to a reveal request. Without a filter
// they paste a phone number into it and skip the approval gate entirely, which
// removes the thing that makes Flipd different: contact is never shared, all
// messaging happens in-app after the seller approves.
//
// This is a speed bump against casual circumvention, not airtight enforcement.
// Someone determined will get a number through. The bias is deliberately toward
// letting an edge case pass rather than blocking a legitimate message, because
// a false positive blocks a real buyer and a false negative costs one leak.
//
// Applies to the INTRO MESSAGE ONLY. Once a thread is open the two parties are
// connected and may legitimately swap numbers to meet up; filtering there would
// fight the user.

const DIGIT_WORDS: Record<string, string> = {
  zero: '0', oh: '0', one: '1', two: '2', three: '3', four: '4',
  five: '5', six: '6', seven: '7', eight: '8', nine: '9',
};

// Spelled-out numbers ("two one three five five five...") normalized to digits
// so the run-length check below sees them.
function digitsFromWords(text: string): string {
  return text
    .toLowerCase()
    .split(/[^a-z]+/)
    .map((w) => DIGIT_WORDS[w] ?? ' ')
    .join('');
}

const EMAIL_RE = /[a-z0-9._%+-]+\s*(?:@|\(at\)|\[at\]|\s+at\s+)\s*[a-z0-9.-]+\s*(?:\.|\(dot\)|\s+dot\s+)\s*[a-z]{2,}/i;
const HANDLE_RE = /(?:^|[\s(])@[a-z0-9._]{3,}/i;
// A platform name followed by something that looks like a handle. The optional
// filler word covers the natural phrasings people actually use — "snap me
// jane_sc", "my ig is janesc", "hit me up on venmo @jane-sc".
const PLATFORM_RE = /\b(?:insta(?:gram)?|ig|snap(?:chat)?|venmo|telegram|whats\s?app|discord)\b[\s:@-]*(?:is|me|at|my|us)?[\s:@-]*[a-z0-9._@-]{3,}/i;
const URL_RE = /\b(?:instagram|ig|snapchat|venmo|t)\.(?:com|me)\/[a-z0-9._-]+/i;

// Seven or more digits in a loose run: covers 5551234, 555-123-4567,
// (213) 555 0100, and 213.555.0100 alike.
function hasPhoneRun(text: string): boolean {
  const runs = text.match(/[\d][\d\s().+-]{5,}[\d]/g) ?? [];
  return runs.some((r) => (r.match(/\d/g) ?? []).length >= 7);
}

export type ContactHit = 'email' | 'handle' | 'platform' | 'phone' | 'url';

// Which kinds of contact info the text appears to contain. Empty means clean.
export function findContactInfo(text: string): ContactHit[] {
  if (!text?.trim()) return [];
  const hits: ContactHit[] = [];
  if (EMAIL_RE.test(text)) hits.push('email');
  if (URL_RE.test(text)) hits.push('url');
  if (PLATFORM_RE.test(text)) hits.push('platform');
  if (HANDLE_RE.test(text)) hits.push('handle');
  if (hasPhoneRun(text) || hasPhoneRun(digitsFromWords(text))) hits.push('phone');
  return hits;
}

export function containsContactInfo(text: string): boolean {
  return findContactInfo(text).length > 0;
}

// Shown inline when a send is blocked. One sentence on what to change and one
// on why, so the rule reads as a design choice rather than a malfunction.
export const CONTACT_BLOCKED_MESSAGE =
  'Keep contact details out of your message. Chat opens right here once the seller approves.';

// ── Attachments ──────────────────────────────────────────────────────
// Enforced server-side (the API is the only writer) and mirrored client-side so
// a too-large file fails before it uploads rather than after.
export const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
export const VIDEO_MIME = ['video/mp4', 'video/quicktime'];
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB
export const MAX_VIDEO_SECONDS = 60;
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;

export type AttachmentKind = 'image' | 'video';

export function attachmentKind(mime: string): AttachmentKind | null {
  if (IMAGE_MIME.includes(mime)) return 'image';
  if (VIDEO_MIME.includes(mime)) return 'video';
  return null;
}

// null when acceptable, else a human reason suitable for showing directly.
export function attachmentError(
  mime: string,
  sizeBytes: number,
  durationSeconds?: number | null,
): string | null {
  const kind = attachmentKind(mime);
  if (!kind) return 'That file type is not supported. Send a photo or a video.';
  if (sizeBytes <= 0) return 'That file looks empty.';
  if (kind === 'image' && sizeBytes > MAX_IMAGE_BYTES) return 'Photos need to be under 10 MB.';
  if (kind === 'video') {
    if (sizeBytes > MAX_VIDEO_BYTES) return 'Videos need to be under 100 MB.';
    if (durationSeconds != null && durationSeconds > MAX_VIDEO_SECONDS) {
      return 'Videos need to be 60 seconds or shorter.';
    }
  }
  return null;
}

// A message must say something or carry something. This lives here rather than
// in a check constraint because Postgres forbids subqueries in check
// constraints and the rule spans two tables.
export function isSendableMessage(body: string, attachmentCount: number): boolean {
  return body.trim().length > 0 || attachmentCount > 0;
}

// ── Trust signals ────────────────────────────────────────────────────
// A star average alone misleads early on: 4.5 from two ratings is noise. Pair
// it with completed-swap counts, and label a brand-new account plainly so an
// empty profile reads as a known state rather than a surprise.
export function swapCountLabel(asBuyer: number, asSeller: number): string {
  const total = asBuyer + asSeller;
  if (total === 0) return 'New to Flipd';
  return `${total} completed swap${total === 1 ? '' : 's'} on Flipd`;
}

// ── Profile links ────────────────────────────────────────────────────
// Prefer the handle so a profile URL reads as /u/flipd.team rather than a raw
// UUID. Handles are optional and unique; the id stays a valid fallback, and
// the API resolves either form so older links keep working.
export function profilePath(who: { id: string; handle?: string | null }): string {
  return `/u/${encodeURIComponent(who.handle || who.id)}`;
}

// Every "Open chat" in the app lands on the conversations tab with the thread
// already open, rather than a separate full-page route. /messages/<id> still
// works for deep links from email.
export function conversationHref(threadId: string): string {
  return `/requests?tab=conversations&thread=${threadId}`;
}
