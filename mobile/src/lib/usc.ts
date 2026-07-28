// Copied from the web app's src/lib/validation.ts to keep both consistent.
// /mobile is a separate package and can't import the web app's src.
export function isUscEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  return /^[^\s@]+@usc\.edu$/.test(e);
}
