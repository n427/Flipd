import { describe, expect, it } from 'vitest';
import { mergeWantedUnreadSnapshot } from './unreadState';

describe('mobile unread partial refresh state', () => {
  const previous = {
    offers: [{ id: 'old-offer', status: 'accepted' }],
    events: [{ id: 'old-event', event_type: 'accepted', wanted_offer_id: 'old-offer', read_at: null, dismissed_at: null }],
    unreadChatOfferIds: ['old-offer'],
  };

  it('updates successful sources and preserves each failed source independently', () => {
    expect(mergeWantedUnreadSnapshot(previous, {
      offers: [{ id: 'new-offer', status: 'pending' }],
      events: undefined,
      unreadChatOfferIds: undefined,
    })).toEqual({ ...previous, offers: [{ id: 'new-offer', status: 'pending' }] });
  });

  it('preserves accepted-chat exclusions when threads fail', () => {
    expect(mergeWantedUnreadSnapshot(previous, {
      offers: [], events: [], unreadChatOfferIds: undefined,
    }).unreadChatOfferIds).toEqual(['old-offer']);
  });
});
