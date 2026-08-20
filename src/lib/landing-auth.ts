import { isUscEmail } from './validation';

export type LandingEmailResult = { email: string } | string;

export function validateLandingEmail(value: string): LandingEmailResult {
  const email = value.trim().toLowerCase();
  if (!email) return 'Enter your USC email address.';
  if (!isUscEmail(email)) return 'Flipd is USC-only for now. Enter your @usc.edu address.';
  return { email };
}
