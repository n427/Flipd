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

// Keeps plaintext codes out of the table, but is not a meaningful barrier to
// offline brute force at this keyspace (6 digits, exhaustible in seconds). What
// actually protects the code is the 10-minute expiry, the attempt cap, and the
// fact that redeeming one requires the user's own authenticated session.
export function hashCode(code: string, userId: string): string {
  return createHash('sha256').update(`${userId}:${code}`).digest('hex');
}

// US numbers only — Flipd is USC-only, and accepting international formats
// would mean carrier rules and costs this build does not handle. Rejects strings
// with letters (they are not phone numbers), and validates against NANP rules
// so we do not text bogus numbers that cost money.
export function normalizePhone(raw: string): string | null {
  const input = raw ?? '';
  // Reject any input containing a letter; only allow digits and common formatting chars.
  if (/[a-zA-Z]/.test(input)) return null;
  if (!/^[\d\s+\-().]*$/.test(input)) return null;

  const digits = input.replace(/\D/g, '');

  // Normalize to 10 digits and validate NANP rules: area code and exchange
  // code must both start with 2-9 (first digit cannot be 0 or 1).
  if (digits.length === 10) {
    if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return null;
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    if (!/^1[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return null;
    return `+${digits}`;
  }
  return null;
}

// Carriers require these to work regardless of what our app thinks. Matched
// only when the whole message is the keyword, so "stop by the popup" is a
// message, not an opt-out.
const STOP_WORDS = new Set(['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit']);
export function isStopKeyword(body: string): boolean {
  return STOP_WORDS.has((body ?? '').trim().toLowerCase());
}
