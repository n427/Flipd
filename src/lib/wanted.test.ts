import { describe, expect, it } from 'vitest';
import {
  blockedUserIdsFromLookup,
  parseWantedCursor,
  parseWantedPostInput,
  serializeWantedCursor,
  toPublicWantedPost,
  wantedCursorFilter,
  wantedPostComesAfterCursor,
} from './wanted';

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

  it('round-trips opaque cursors without truncating PostgreSQL microseconds', () => {
    const cursor = {
      created_at: '2026-08-25T12:00:00.123456+00:00',
      id: 'a0000000-0000-4000-8000-000000000001',
    };

    expect(parseWantedCursor(serializeWantedCursor(cursor))).toEqual(cursor);
    expect(parseWantedCursor('not-a-cursor')).toBeNull();
  });

  it('uses ID as a descending tiebreaker after the same timestamp', () => {
    const cursor = {
      created_at: '2026-08-25T12:00:00.123456+00:00',
      id: 'b0000000-0000-4000-8000-000000000002',
    };

    expect(wantedPostComesAfterCursor({
      created_at: '2026-08-25T12:00:00.123456+00:00',
      id: 'a0000000-0000-4000-8000-000000000001',
    }, cursor)).toBe(true);
    expect(wantedPostComesAfterCursor({
      created_at: '2026-08-25T12:00:00.123456+00:00',
      id: 'c0000000-0000-4000-8000-000000000003',
    }, cursor)).toBe(false);
    expect(wantedCursorFilter(cursor)).toBe(
      'created_at.lt.2026-08-25T12:00:00.123456+00:00,and(created_at.eq.2026-08-25T12:00:00.123456+00:00,id.lt.b0000000-0000-4000-8000-000000000002)',
    );
  });

  it('fails closed when a block lookup errors', () => {
    expect(blockedUserIdsFromLookup('viewer', {
      data: [{ blocker_id: 'viewer', blocked_id: 'buyer' }],
      error: new Error('database unavailable'),
    })).toEqual({ ok: false, error: 'unable to verify blocks' });
  });
});
