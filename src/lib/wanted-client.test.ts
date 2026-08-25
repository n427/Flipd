import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  dismissNotificationWithoutNavigation,
  prepareWantedPostInput,
  wantedClient,
  wantedFeedUrl,
  wantedNotificationHref,
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

  it('returns the delete route acknowledgement instead of a post DTO', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;
    try {
      const result = await wantedClient.deletePost('post-1');
      expectTypeOf(result).toEqualTypeOf<{ ok: true }>();
      expect(result).toEqual({ ok: true });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('routes offer lifecycle events to the participant inbox and live post events to detail', () => {
    const event = {
      id: 'event-1', event_key: 'key', wanted_post_id: 'post-1', wanted_offer_id: 'offer-1',
      title: 'Update', body: 'Body', created_at: '2026-08-25T12:00:00.000Z', read_at: null, dismissed_at: null,
    };

    expect(wantedNotificationHref({ ...event, event_type: 'new-offer' })).toBe('/requests?tab=wanted&direction=received');
    expect(wantedNotificationHref({ ...event, event_type: 'accepted' })).toBe('/requests?tab=wanted&direction=sent');
    expect(wantedNotificationHref({ ...event, event_type: 'declined' })).toBe('/requests?tab=wanted&direction=sent');
    expect(wantedNotificationHref({ ...event, event_type: 'expired' })).toBe('/requests?tab=wanted&direction=sent');
    expect(wantedNotificationHref({ ...event, event_type: 'edit' })).toBe('/wanted/post-1');
    expect(wantedNotificationHref({ ...event, event_type: 'reminder' })).toBe('/wanted/post-1');
    expect(wantedNotificationHref({ ...event, event_type: 'edit', wanted_post_id: null })).toBe('/wanted');
  });

  it('isolates dismiss activation from notification navigation', () => {
    let propagationStopped = false;
    let dismissed = '';
    dismissNotificationWithoutNavigation(
      { stopPropagation: () => { propagationStopped = true; } },
      'event-1',
      (id) => { dismissed = id; },
    );
    expect(propagationStopped).toBe(true);
    expect(dismissed).toBe('event-1');
  });
});
