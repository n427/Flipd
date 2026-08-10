import { describe, it, expect } from 'vitest';
import { normalizeQuery } from './query';

describe('normalizeQuery', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeQuery('  north   face  ')).toBe('north face');
  });
  it('rejects empty and whitespace-only queries', () => {
    expect(normalizeQuery('   ')).toBeNull();
  });
  it('caps length so a pasted essay cannot bloat the digest prompt', () => {
    expect(normalizeQuery('x'.repeat(500))?.length).toBe(200);
  });
});

describe('normalizeQuery — non-string input', () => {
  it('rejects a number rather than throwing on .trim()', () => {
    expect(normalizeQuery(123 as unknown as string)).toBeNull();
  });
  it('rejects null, undefined, and objects', () => {
    expect(normalizeQuery(null as unknown as string)).toBeNull();
    expect(normalizeQuery(undefined as unknown as string)).toBeNull();
    expect(normalizeQuery({} as unknown as string)).toBeNull();
  });
});
