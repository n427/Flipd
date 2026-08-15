import { describe, it, expect } from 'vitest';
import { photoCrop } from './photoCrop';

describe('photoCrop', () => {
  it('centres a photo with no stored framing', () => {
    expect(photoCrop(undefined, undefined)).toEqual({
      contentPosition: { left: '50%', top: '50%' },
      scale: 1,
    });
  });

  it('reads the seller-chosen focus point', () => {
    expect(photoCrop('20% 80%', undefined)).toEqual({
      contentPosition: { left: '20%', top: '80%' },
      scale: 1,
    });
  });

  it('applies zoom above 1', () => {
    expect(photoCrop('50% 50%', '1.8').scale).toBe(1.8);
  });

  it('ignores zoom at or below 1, which would shrink the photo off its frame', () => {
    expect(photoCrop(null, '1').scale).toBe(1);
    expect(photoCrop(null, '0.4').scale).toBe(1);
  });

  it('caps zoom at 3, matching the web clamp', () => {
    expect(photoCrop(null, '9').scale).toBe(3);
  });

  it('falls back to centre on malformed input rather than rendering nothing', () => {
    expect(photoCrop('nonsense', 'abc')).toEqual({
      contentPosition: { left: '50%', top: '50%' },
      scale: 1,
    });
  });

  it('accepts a focus with extra whitespace', () => {
    expect(photoCrop('  30%   70%  ', null).contentPosition).toEqual({ left: '30%', top: '70%' });
  });
});
