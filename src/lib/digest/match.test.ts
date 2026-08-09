import { describe, it, expect } from 'vitest';
import { parseMatches, MAX_MATCHES, DIGEST_MODEL } from './match';

const valid = new Set(['a', 'b', 'c']);

describe('parseMatches', () => {
  it('parses well-formed output', () => {
    const out = parseMatches(JSON.stringify({ matches: [{ id: 'a', reason: 'like your lamp' }] }), valid);
    expect(out).toEqual([{ id: 'a', reason: 'like your lamp' }]);
  });
  it('drops ids that were not in the candidate set — a hallucinated id would 404 in the email', () => {
    const out = parseMatches(JSON.stringify({ matches: [{ id: 'zzz', reason: 'x' }] }), valid);
    expect(out).toEqual([]);
  });
  it('returns [] on unparseable output rather than throwing', () => {
    expect(parseMatches('not json', valid)).toEqual([]);
  });
  it('returns [] when the model correctly finds nothing', () => {
    expect(parseMatches(JSON.stringify({ matches: [] }), valid)).toEqual([]);
  });
  it('caps at MAX_MATCHES even if the model returns more', () => {
    const many = { matches: ['a', 'b', 'c', 'a', 'b', 'c'].map((id) => ({ id, reason: 'r' })) };
    expect(parseMatches(JSON.stringify(many), valid).length).toBeLessThanOrEqual(MAX_MATCHES);
  });
  it('pins the model behind one constant', () => {
    expect(DIGEST_MODEL).toBe('claude-opus-5');
  });
});
