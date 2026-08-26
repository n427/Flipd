import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { effectivePostedAt, repostAvailability, repostListingRequest } from './repost';

describe('reposting', () => {
  const now = new Date('2026-09-08T12:00:00.000Z');

  it('uses the latest repost time as the visible posted date', () => {
    expect(effectivePostedAt('2026-08-01T12:00:00.000Z', null)).toBe('2026-08-01T12:00:00.000Z');
    expect(effectivePostedAt('2026-08-01T12:00:00.000Z', '2026-09-01T12:00:00.000Z')).toBe('2026-09-01T12:00:00.000Z');
  });

  it('allows an active post to be reposted after seven days', () => {
    expect(repostAvailability({ active: true, postedAt: '2026-09-01T12:00:00.000Z' }, now))
      .toEqual({ allowed: true, availableAt: '2026-09-08T12:00:00.000Z' });
  });

  it('returns the next available time during the cooldown', () => {
    expect(repostAvailability({ active: true, postedAt: '2026-09-03T12:00:00.000Z' }, now))
      .toEqual({ allowed: false, availableAt: '2026-09-10T12:00:00.000Z', reason: 'cooldown' });
  });

  it('never allows closed posts to be reposted', () => {
    expect(repostAvailability({ active: false, postedAt: '2026-08-01T12:00:00.000Z' }, now))
      .toEqual({ allowed: false, availableAt: null, reason: 'closed' });
  });

  it('calls the listing repost endpoint and returns its posted time', async () => {
    const fetcher = vi.fn(async () => Response.json({ posted_at: '2026-09-08T12:00:00Z' }));
    await expect(repostListingRequest('listing-1', fetcher)).resolves.toEqual({ posted_at: '2026-09-08T12:00:00Z' });
    expect(fetcher).toHaveBeenCalledWith('/api/listings/listing-1/repost', { method: 'POST' });
  });
});
