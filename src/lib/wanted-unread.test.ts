import { describe, expect, it } from 'vitest';
import { countWantedUnreadAttention } from './wanted-unread';

describe('Wanted unread attention', () => {
  it('counts pending received offers and unread new-offer events once per offer', () => {
    expect(countWantedUnreadAttention(
      [{ id: 'pending-1', status: 'pending' }, { id: 'accepted-1', status: 'accepted' }],
      [
        { event_type: 'new-offer', wanted_offer_id: 'pending-1', read_at: null, dismissed_at: null },
        { event_type: 'new-offer', wanted_offer_id: 'new-2', read_at: null, dismissed_at: null },
        { event_type: 'edit', wanted_offer_id: 'pending-1', read_at: null, dismissed_at: null },
      ],
      [],
    )).toBe(3);
  });

  it('does not double-count an accepted offer represented by an unread chat', () => {
    expect(countWantedUnreadAttention(
      [{ id: 'accepted-1', status: 'accepted' }],
      [{ event_type: 'new-offer', wanted_offer_id: 'accepted-1', read_at: null, dismissed_at: null }],
      ['accepted-1'],
    )).toBe(0);
  });

  it('keeps other unread notifications while ignoring read and dismissed events', () => {
    expect(countWantedUnreadAttention([], [
      { event_type: 'new-offer', wanted_offer_id: 'one', read_at: 'now', dismissed_at: null },
      { event_type: 'new-offer', wanted_offer_id: 'two', read_at: null, dismissed_at: 'now' },
      { event_type: 'reminder', wanted_offer_id: null, read_at: null, dismissed_at: null },
    ], [])).toBe(1);
  });
});
