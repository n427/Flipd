import { describe, expect, it } from 'vitest';
import {
  prepareWantedPostInput,
  wantedFeedUrl,
  wantedOffersUrl,
} from './wanted-client';

describe('Wanted web client', () => {
  it('serializes Wanted feed filters without undefined parameters', () => {
    expect(wantedFeedUrl({ q: 'desk', category: 'goods', budget: 80 }))
      .toBe('/api/wanted?q=desk&category=goods&budget=80');
  });

  it('trims create payload text without mutating the caller input', () => {
    const input = {
      title: '  Standing desk  ',
      category: 'goods' as const,
      max_budget: 80,
      description: '  Walnut or bamboo  ',
      location: '  USC Village  ',
      photo_urls: ['  https://example.com/desk.jpg  '],
      needed_by: '2026-09-01T06:59:59.000Z',
    };

    expect(prepareWantedPostInput(input)).toEqual({
      ...input,
      title: 'Standing desk',
      description: 'Walnut or bamboo',
      location: 'USC Village',
      photo_urls: ['https://example.com/desk.jpg'],
    });
    expect(input.title).toBe('  Standing desk  ');
  });

  it('selects received and sent offer endpoints', () => {
    expect(wantedOffersUrl('received')).toBe('/api/wanted-offers?role=buyer');
    expect(wantedOffersUrl('sent')).toBe('/api/wanted-offers?role=seller');
  });
});
