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
