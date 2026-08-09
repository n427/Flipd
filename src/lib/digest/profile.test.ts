import { describe, it, expect } from 'vitest';
import { buildProfile } from './profile';

describe('buildProfile', () => {
  it('returns null with no signals — cold start means no digest', () => {
    expect(buildProfile({ saved: [], messaged: [], searched: [] })).toBeNull();
  });
  it('labels each signal so the model can weight them', () => {
    const p = buildProfile({ saved: ['desk lamp'], messaged: ['mini fridge'], searched: ['rug'] })!;
    expect(p).toContain('Saved: desk lamp');
    expect(p).toContain('Messaged about: mini fridge');
    expect(p).toContain('Searched: rug');
  });
  it('dedupes repeats — searching "rug" ten times is one interest, not ten', () => {
    const p = buildProfile({ saved: [], messaged: [], searched: ['rug', 'rug', 'rug'] })!;
    expect(p.match(/rug/g)).toHaveLength(1);
  });
  it('omits empty categories rather than printing an empty label', () => {
    const p = buildProfile({ saved: ['lamp'], messaged: [], searched: [] })!;
    expect(p).not.toContain('Messaged about:');
  });
});
