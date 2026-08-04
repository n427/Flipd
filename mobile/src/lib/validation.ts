// Intro-message contact filter, attachment limits, and trust labels.
//
// MIRROR of the matching section in the web app's src/lib/validation.ts. The
// two bundlers have separate roots (`@/*` resolves to src/ in each), so a
// cross-import isn't possible without a shared workspace package. If you edit
// the rules here, edit them there too.
//
// Drift is not a security problem: the server rejects independently, so a stale
// copy here only means the buyer finds out on send instead of as they type.

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
  // Normalize before matching. Pickers report types this list would otherwise
  // reject outright: a parameter suffix ("image/jpeg; charset=..."), mixed
  // case, or the common image/jpg spelling. A real photo failing the check
  // reads to the user as "can't attach photos at all".
  const m = mime.toLowerCase().split(';')[0].trim();
  const normalized = m === 'image/jpg' ? 'image/jpeg' : m === 'video/mov' ? 'video/quicktime' : m;
  if (IMAGE_MIME.includes(normalized)) return 'image';
  if (VIDEO_MIME.includes(normalized)) return 'video';
  // Unknown-but-plausible types still sort by prefix rather than being
  // refused; the server enforces the real allow-list on upload.
  if (normalized.startsWith('image/')) return 'image';
  if (normalized.startsWith('video/')) return 'video';
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
