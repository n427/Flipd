import { describe, expect, it, vi } from 'vitest';
import { repostAvailability, repostListing, repostWantedPost } from './repost';

const deps = (fetcher: typeof fetch) => ({
  fetcher,
  getAccessToken: async () => 'token',
  apiBase: 'https://flipd.test',
});

describe('mobile reposting', () => {
  it('posts authenticated listing and Wanted repost requests', async () => {
    const fetcher = vi.fn(async () => Response.json({ posted_at: '2026-09-08T12:00:00Z' }));
    await expect(repostListing('listing-1', deps(fetcher))).resolves.toBe('2026-09-08T12:00:00Z');
    await expect(repostWantedPost('wanted-1', deps(fetcher))).resolves.toBe('2026-09-08T12:00:00Z');
    expect(fetcher).toHaveBeenNthCalledWith(1, 'https://flipd.test/api/listings/listing-1/repost', {
      method: 'POST', headers: { Authorization: 'Bearer token' },
    });
    expect(fetcher).toHaveBeenNthCalledWith(2, 'https://flipd.test/api/wanted/wanted-1/repost', {
      method: 'POST', headers: { Authorization: 'Bearer token' },
    });
  });

  it('disables reposting until seven days after the visible posted date', () => {
    expect(repostAvailability(true, '2026-09-03T12:00:00Z', new Date('2026-09-08T12:00:00Z')))
      .toEqual({ allowed: false, availableAt: '2026-09-10T12:00:00.000Z' });
    expect(repostAvailability(true, '2026-09-01T12:00:00Z', new Date('2026-09-08T12:00:00Z')).allowed).toBe(true);
    expect(repostAvailability(false, '2026-08-01T12:00:00Z', new Date('2026-09-08T12:00:00Z')))
      .toEqual({ allowed: false, availableAt: null });
  });
});
