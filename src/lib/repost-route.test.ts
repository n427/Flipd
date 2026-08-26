import { describe, expect, it } from 'vitest';
import { repostErrorResponse } from './repost';

describe('repost API errors', () => {
  it('keeps missing and non-owner posts private', () => {
    expect(repostErrorResponse({ code: 'P0002', message: 'post not found' })).toEqual({ status: 404, error: 'not found' });
  });

  it('returns a conflict for cooldown and closed posts', () => {
    expect(repostErrorResponse({ code: 'P0001', message: 'repost cooldown active', details: '2026-09-10T12:00:00Z' }))
      .toEqual({ status: 409, error: 'repost cooldown active', available_at: '2026-09-10T12:00:00Z' });
    expect(repostErrorResponse({ code: '23514', message: 'post is closed' })).toEqual({ status: 409, error: 'post is closed' });
  });
});
