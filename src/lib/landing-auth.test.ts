import { describe, expect, it } from 'vitest';

import { validateLandingEmail } from './landing-auth';

describe('validateLandingEmail', () => {
  it('rejects empty and non-USC addresses before sign-in', () => {
    expect(validateLandingEmail('')).toBe('Enter your USC email address.');
    expect(validateLandingEmail('student@gmail.com')).toBe(
      'Flipd is USC-only for now. Enter your @usc.edu address.',
    );
  });

  it('accepts and normalizes a USC address', () => {
    expect(validateLandingEmail('  STUDENT@USC.EDU ')).toEqual({
      email: 'student@usc.edu',
    });
  });
});
