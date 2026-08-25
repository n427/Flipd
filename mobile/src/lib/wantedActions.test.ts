import { describe, expect, it, vi } from 'vitest';
import { completeWantedOffer, rateWantedOffer, reportWantedTarget } from './wanted';

const deps = (fetcher: ReturnType<typeof vi.fn>) => ({ apiBase: 'https://flipd.test', getAccessToken: async () => 'token', fetcher: fetcher as unknown as typeof fetch });
const response = (body: unknown = {}, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;

describe('Wanted transaction and moderation client', () => {
  it('completes and rates the Wanted source explicitly', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({ transaction: { status: 'completed' } })).mockResolvedValueOnce(response({ ok: true }));
    await completeWantedOffer('offer-1', deps(fetcher));
    await rateWantedOffer('offer-1', 5, 'great', deps(fetcher));
    expect(fetcher.mock.calls[0][0]).toBe('https://flipd.test/api/transactions/wanted/offer-1/complete');
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ wanted_offer_id: 'offer-1', score: 5, text: 'great' });
  });

  it('reports exactly one Wanted target', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ ok: true }));
    await reportWantedTarget({ wantedPostId: 'post-1' }, 'scam', 'details', deps(fetcher));
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ wanted_post_id: 'post-1', reason: 'scam', note: 'details' });
  });
});
