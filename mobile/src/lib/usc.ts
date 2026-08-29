// Copied from the web app's src/lib/validation.ts to keep both consistent.
// /mobile is a separate package and can't import the web app's src.

// TEMP TEST ALLOW-LIST: USC's Proofpoint filter is silently dropping the
// auth emails, so this one address is allowed through for on-device testing
// while USC deliverability is sorted. Remove this once USC email works.
const TEST_ALLOW = new Set(['nicolexzha@gmail.com']);

export function isUscEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  if (TEST_ALLOW.has(e)) return true;
  return /^[^\s@]+@(alumni\.)?usc\.edu$/.test(e);
}
