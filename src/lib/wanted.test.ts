import { describe, expect, it } from 'vitest';
import { parseWantedPostInput, toPublicWantedPost } from './wanted';

describe('Wanted posts', () => {
  it('requires a future deadline and positive whole-dollar budget', () => {
    expect(parseWantedPostInput({
      title: 'Desk', category: 'goods', max_budget: 80, description: 'Wood desk',
      location: 'Village', needed_by: '2026-09-01T12:00:00Z',
    }, new Date('2026-08-25T12:00:00Z')).ok).toBe(true);
    expect(parseWantedPostInput({
      title: 'Desk', category: 'goods', max_budget: 0, description: 'Wood desk',
      location: 'Village', needed_by: '2026-09-01T12:00:00Z',
    }, new Date('2026-08-25T12:00:00Z')).ok).toBe(false);
  });

  it('normalizes only valid, public post input', () => {
    const parsed = parseWantedPostInput({
      title: '  Desk  ', category: 'goods', max_budget: 80, description: '  Wood desk  ',
      location: '  Village  ', photo_urls: ['https://images.example/desk.jpg'],
      needed_by: '2026-09-01T12:00:00.000Z',
    }, new Date('2026-08-25T12:00:00Z'));

    expect(parsed).toEqual({
      ok: true,
      value: {
        title: 'Desk', category: 'goods', max_budget: 80, description: 'Wood desk',
        location: 'Village', photo_urls: ['https://images.example/desk.jpg'],
        needed_by: '2026-09-01T12:00:00.000Z',
      },
    });
    expect(parseWantedPostInput({
      title: 'Desk', category: 'event', max_budget: 80.5, description: 'Wood desk',
      location: 'Village', photo_urls: ['http://images.example/desk.jpg'],
      needed_by: 'not-a-date',
    }, new Date('2026-08-25T12:00:00Z')).ok).toBe(false);
  });

  it('exposes only aggregate offer count publicly', () => {
    const dto = toPublicWantedPost({
      id: 'p1', buyer_id: 'b1', title: 'Desk', category: 'goods', max_budget: 80,
      description: 'Wood', location: 'Village', photo_urls: [],
      needed_by: '2026-09-01T12:00:00Z', status: 'active',
      created_at: '2026-08-25T12:00:00Z', offers: [{ count: 3 }],
    });

    expect(dto.offer_count).toBe(3);
    expect(dto).not.toHaveProperty('offers');
    expect(dto).not.toHaveProperty('buyer_id');
  });

  it('computes expiry without exposing database-only fields', () => {
    const dto = toPublicWantedPost({
      id: 'p1', buyer_id: 'b1', title: 'Desk', category: 'goods', max_budget: 80,
      description: 'Wood', location: 'Village', photo_urls: [],
      needed_by: '2026-08-24T12:00:00Z', status: 'active',
      created_at: '2026-08-25T12:00:00Z', resolved_at: null, updated_at: 'private',
      offers: [{ count: 3, seller_id: 'private' }],
    }, new Date('2026-08-25T12:00:00Z'));

    expect(dto).toEqual({
      id: 'p1', title: 'Desk', category: 'goods', max_budget: 80, description: 'Wood',
      location: 'Village', photo_urls: [], needed_by: '2026-08-24T12:00:00Z',
      status: 'expired', created_at: '2026-08-25T12:00:00Z', offer_count: 3,
    });
  });
});
