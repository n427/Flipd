import { describe, it, expect } from 'vitest';
import { normalizeQuery } from './route';

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
