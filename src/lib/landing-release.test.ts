import { describe, expect, it } from 'vitest';

import { landingTiles, revealStyle } from './landing-release';

describe('landing release behavior', () => {
  it('keeps release-critical content visible before client hydration', () => {
    expect(revealStyle(120)).toMatchObject({
      opacity: 1,
      transform: 'translateY(0)',
    });
  });

  it('uses bundled product artwork rather than remote placeholder hosts', () => {
    expect(landingTiles.map((tile) => tile.img)).toEqual([
      '/landing/market-bread.svg',
      '/landing/market-nails.svg',
      '/landing/market-chair.svg',
      '/landing/market-matcha.svg',
    ]);
  });
});
