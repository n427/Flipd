import { describe, expect, it } from 'vitest';
import { isUscEmail } from './usc';

describe('isUscEmail', () => {
  it('accepts student and official alumni addresses', () => {
    expect(isUscEmail('trojan@usc.edu')).toBe(true);
    expect(isUscEmail('trojan@alumni.usc.edu')).toBe(true);
    expect(isUscEmail('Trojan@ALUMNI.USC.EDU')).toBe(true);
  });

  it('rejects lookalike alumni domains', () => {
    expect(isUscEmail('trojan@fake.alumni.usc.edu')).toBe(false);
    expect(isUscEmail('trojan@alumni.usc.edu.example.com')).toBe(false);
  });
});
