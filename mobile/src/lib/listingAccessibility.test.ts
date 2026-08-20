import { describe, expect, it } from 'vitest';
import { listingCardAccessibilityLabel } from './listingAccessibility';

describe('listingCardAccessibilityLabel', () => {
  it('announces the listing, seller context, and action', () => {
    expect(
      listingCardAccessibilityLabel({
        title: 'Desk lamp',
        price: '$12',
        seller: 'Nicole · Viterbi · Senior',
      }),
    ).toBe('Desk lamp, $12, Nicole · Viterbi · Senior. Open listing');
  });
});
