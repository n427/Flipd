import { createHash, randomInt } from 'crypto';

// A 6-digit code has only a million possibilities, so the hash is not what
// makes it safe — the attempt cap and the short expiry are. The hash exists so
// that a leak of the table cannot be replayed directly.
export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_MS = 60 * 1000;

// randomInt, not Math.random: this is a credential, however short-lived.
export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

// Salted with the user id so one stolen hash cannot be tested against every
// other pending code in the table.
export function hashCode(code: string, userId: string): string {
  return createHash('sha256').update(`${userId}:${code}`).digest('hex');
}

// US numbers only — Flipd is USC-only, and accepting international formats
// would mean carrier rules and costs this build does not handle.
export function normalizePhone(raw: string): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

// Carriers require these to work regardless of what our app thinks. Matched
// only when the whole message is the keyword, so "stop by the popup" is a
// message, not an opt-out.
const STOP_WORDS = new Set(['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit']);
export function isStopKeyword(body: string): boolean {
  return STOP_WORDS.has((body ?? '').trim().toLowerCase());
}
