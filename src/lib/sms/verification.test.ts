import { describe, expect, it } from 'vitest';
import {
  generateCode, hashCode, normalizePhone, isStopKeyword,
  CODE_TTL_MS, MAX_ATTEMPTS,
} from './verification';

describe('generateCode', () => {
  it('is always six digits, including when the value is small', () => {
    for (let i = 0; i < 200; i++) expect(generateCode()).toMatch(/^\d{6}$/);
  });

  it('is not constant', () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateCode()));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('hashCode', () => {
  it('is deterministic for the same code and user', () => {
    expect(hashCode('123456', 'u1')).toBe(hashCode('123456', 'u1'));
  });

  it('differs across users, so one leaked hash does not unlock another account', () => {
    expect(hashCode('123456', 'u1')).not.toBe(hashCode('123456', 'u2'));
  });

  it('never returns the code itself', () => {
    expect(hashCode('123456', 'u1')).not.toContain('123456');
  });
});

describe('normalizePhone', () => {
  it('accepts common US formats and returns E.164', () => {
    expect(normalizePhone('(310) 555-0123')).toBe('+13105550123');
    expect(normalizePhone('310-555-0123')).toBe('+13105550123');
    expect(normalizePhone('3105550123')).toBe('+13105550123');
    expect(normalizePhone('+1 310 555 0123')).toBe('+13105550123');
    expect(normalizePhone('13105550123')).toBe('+13105550123');
  });

  it('rejects anything that is not a plausible US number', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('555')).toBeNull();
    expect(normalizePhone('not a phone')).toBeNull();
    expect(normalizePhone('+44 20 7946 0958')).toBeNull();
    expect(normalizePhone('31055501234567')).toBeNull();
  });

  it('rejects NANP-invalid numbers (area code or exchange starting with 0 or 1)', () => {
    expect(normalizePhone('1234567890')).toBeNull(); // area code starts with 1
    expect(normalizePhone('0235550123')).toBeNull(); // area code starts with 0
    expect(normalizePhone('3101550123')).toBeNull(); // exchange code starts with 1
  });

  it('rejects strings with letters even if they contain 10 valid digits', () => {
    expect(normalizePhone('callme3105550123@x.com')).toBeNull();
  });
});

describe('isStopKeyword', () => {
  it('recognises the carrier-mandated opt-out words, case and space insensitive', () => {
    for (const w of ['STOP', 'stop', '  Stop  ', 'STOPALL', 'unsubscribe', 'CANCEL', 'end', 'quit']) {
      expect(isStopKeyword(w)).toBe(true);
    }
  });

  it('does not treat an ordinary message as an opt-out', () => {
    expect(isStopKeyword('stop by the popup later!')).toBe(false);
    expect(isStopKeyword('yes')).toBe(false);
    expect(isStopKeyword('')).toBe(false);
  });
});

describe('constants', () => {
  it('keeps the code short-lived and attempt-capped', () => {
    expect(CODE_TTL_MS).toBe(10 * 60 * 1000);
    expect(MAX_ATTEMPTS).toBe(5);
  });
});
