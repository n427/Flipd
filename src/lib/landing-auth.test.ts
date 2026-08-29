import { describe, expect, it } from 'vitest';

import { validateLandingEmail } from './landing-auth';

describe('validateLandingEmail', () => {
  it('rejects empty and non-USC addresses before sign-in', () => {
    expect(validateLandingEmail('')).toBe('Enter your USC email address.');
    expect(validateLandingEmail('student@gmail.com')).toBe(
      'Enter your @usc.edu or @alumni.usc.edu address.',
    );
  });

  it('accepts and normalizes a USC address', () => {
    expect(validateLandingEmail('  STUDENT@USC.EDU ')).toEqual({
      email: 'student@usc.edu',
    });
  });

  it('accepts and normalizes an official alumni address', () => {
    expect(validateLandingEmail('  ALUM@ALUMNI.USC.EDU ')).toEqual({
      email: 'alum@alumni.usc.edu',
    });
  });
});
