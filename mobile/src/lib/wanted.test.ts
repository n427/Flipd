import { describe, expect, it, vi } from 'vitest';
import {
  acceptWantedOffer,
  createWantedOffer,
  fetchWantedFeed,
  fetchWantedNotifications,
  fetchWantedOffers,
  wantedNotificationDestination,
  wantedPushNotificationDestination,
  WantedApiError,
  type WantedOfferInput,
} from './wanted';

const validOffer: WantedOfferInput = {
  id: '11111111-1111-4111-8111-111111111111',
  price: 75,
  description: 'A compact desk in good condition.',
  message: 'I can meet on campus tomorrow.',
  photo_paths: ['seller/offer/desk.jpg'],
};

const auth = (fetcher: typeof fetch) => ({
  getAccessToken: async () => 'token',
  fetcher,
  apiBase: 'https://flipd.test',
});

describe('mobile Wanted client', () => {
  it('sends an authenticated Wanted offer to the selected post', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ wanted_offer: { id: 'o1' } }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    }));

    const result = await createWantedOffer('p1', validOffer, auth(fetcher));

    expect(result.id).toBe('o1');
    expect(fetcher).toHaveBeenCalledWith('https://flipd.test/api/wanted/p1/offers', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      body: JSON.stringify(validOffer),
    }));
  });

  it('serializes feed filters and pagination into the authenticated URL', async () => {
    const fetcher = vi.fn(async () => Response.json({ wanted_posts: [], next_cursor: null }));

    await fetchWantedFeed({
      q: '  desk  ', category: 'goods', budget: 100, location: '  Village ',
      neededBefore: '2026-09-01T06:59:59.999Z', mine: true, status: 'active', cursor: 'page-token', limit: 20,
    }, auth(fetcher));

    expect(fetcher).toHaveBeenCalledWith(
      'https://flipd.test/api/wanted?q=desk&category=goods&budget=100&location=Village&needed_before=2026-09-01T06%3A59%3A59.999Z&mine=1&status=active&cursor=page-token&limit=20',
      { headers: { Authorization: 'Bearer token' } },
    );
  });

  it('returns the thread id after accepting an offer', async () => {
    const fetcher = vi.fn(async () => Response.json({ thread_id: 'thread-1' }));
    await expect(acceptWantedOffer('offer-1', auth(fetcher))).resolves.toBe('thread-1');
    expect(fetcher).toHaveBeenCalledWith('https://flipd.test/api/wanted-offers/offer-1/accept', {
      method: 'POST', headers: { Authorization: 'Bearer token' },
    });
  });

  it('propagates the server message and status', async () => {
    const fetcher = vi.fn(async () => Response.json({ error: 'Offer is no longer pending.' }, { status: 409 }));
    const result = fetchWantedFeed({}, auth(fetcher));
    await expect(result).rejects.toMatchObject({ message: 'Offer is no longer pending.', status: 409 } satisfies Partial<WantedApiError>);
  });

  it('loads persisted events and maps them to mobile destinations', async () => {
    const fetcher = vi.fn(async () => Response.json({ notification_events: [{
      id: 'event-1', event_key: 'key', event_type: 'new-offer', wanted_post_id: 'post-1', wanted_offer_id: 'offer-1',
      title: 'New offer', body: 'Someone sent an offer.', created_at: '2026-08-25T00:00:00Z', read_at: null, dismissed_at: null,
    }] }));
    const events = await fetchWantedNotifications(auth(fetcher));
    expect(events).toHaveLength(1);
    expect(wantedNotificationDestination(events[0])).toBe('/(tabs)/requests?tab=wanted&direction=received');
    expect(fetcher).toHaveBeenCalledWith('https://flipd.test/api/notification-events', {
      headers: { Authorization: 'Bearer token' },
    });
  });

  it('aggregates compound-cursor notification pages and stops on a repeated cursor', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ notification_events: [{ id: 'event-1' }], next_cursor: 'next-page' }))
      .mockResolvedValueOnce(Response.json({ notification_events: [{ id: 'event-2' }], next_cursor: 'next-page' }));
    const events = await fetchWantedNotifications(auth(fetcher));
    expect(events.map((event) => event.id)).toEqual(['event-1', 'event-2']);
    expect(fetcher).toHaveBeenNthCalledWith(2, 'https://flipd.test/api/notification-events?cursor=next-page', {
      headers: { Authorization: 'Bearer token' },
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('maps the Wanted push payload names emitted by the lifecycle worker', () => {
    expect(wantedPushNotificationDestination('wanted_reminder', 'post-1')).toBe('/wanted/post-1');
    expect(wantedPushNotificationDestination('wanted_expired', 'post-1')).toBe('/(tabs)/requests?tab=wanted&direction=sent');
    expect(wantedPushNotificationDestination('unrelated', 'post-1')).toBeNull();
  });

  it('accepts expired offers returned by the response contract', async () => {
    const fetcher = vi.fn(async () => Response.json({
      wanted_offers: [{ id: 'offer-expired', status: 'expired' }], next_cursor: null,
    }));
    const response = await fetchWantedOffers('sent', undefined, auth(fetcher));
    expect(response.wanted_offers[0].status).toBe('expired');
  });
});
