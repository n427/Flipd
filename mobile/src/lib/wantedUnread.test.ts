import { describe, expect, it } from 'vitest';
import { countWantedUnreadAttention } from './wantedUnread';

describe('mobile Wanted unread attention', () => {
  it('deduplicates pending offers, events, and accepted unread chats', () => {
    expect(countWantedUnreadAttention(
      [{ id: 'pending', status: 'pending' }, { id: 'accepted', status: 'accepted' }],
      [
        { event_type: 'new-offer', wanted_offer_id: 'pending', read_at: null, dismissed_at: null },
        { event_type: 'new-offer', wanted_offer_id: 'accepted', read_at: null, dismissed_at: null },
      ],
      ['accepted'],
    )).toBe(1);
  });
});
