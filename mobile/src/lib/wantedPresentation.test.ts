import { describe, expect, it } from 'vitest';
import { losAngelesEndOfDayUtc, wantedActionState, wantedCardCopy, wantedOfferStatusLabel } from './wantedPresentation';

describe('mobile Wanted presentation', () => {
  it('formats the same public card copy as web', () => {
    expect(wantedCardCopy({ max_budget: 1250, needed_by: '2026-09-02T06:59:59.000Z', offer_count: 0 }, new Date('2026-08-25T12:00:00Z')))
      .toEqual({ budget: 'Up to $1,250', deadline: 'Needed by Sep 1', offers: 'No offers yet' });
    expect(wantedCardCopy({ max_budget: 20, needed_by: '2026-08-24T06:59:59.000Z', offer_count: 2 }, new Date('2026-08-25T12:00:00Z')).deadline)
      .toBe('Expired');
  });

  it('labels every offer status', () => {
    expect(wantedOfferStatusLabel('pending')).toBe('Pending');
    expect(wantedOfferStatusLabel('accepted')).toBe('Accepted');
    expect(wantedOfferStatusLabel('withdrawn')).toBe('Withdrawn');
  });

  it('prevents owners and expired posts from offering', () => {
    expect(wantedActionState({ owner: true, postStatus: 'active' })).toEqual({ kind: 'manage-post', label: 'Edit request' });
    expect(wantedActionState({ owner: false, postStatus: 'expired' })).toEqual({ kind: 'disabled', label: 'Request expired' });
  });

  it('exposes only valid offer actions', () => {
    expect(wantedActionState({ owner: false, postStatus: 'active', offerStatus: 'pending', offerRole: 'seller' })).toEqual({ kind: 'edit-offer', label: 'Edit offer' });
    expect(wantedActionState({ owner: true, postStatus: 'active', offerStatus: 'pending', offerRole: 'buyer' })).toEqual({ kind: 'accept-offer', label: 'Accept & open chat' });
    expect(wantedActionState({ owner: false, postStatus: 'fulfilled', offerStatus: 'accepted', offerRole: 'seller', threadId: 't1' })).toEqual({ kind: 'open-chat', label: 'Open chat', threadId: 't1' });
  });

  it('converts LA end-of-day across daylight time', () => {
    expect(losAngelesEndOfDayUtc('2026-08-25')).toBe('2026-08-26T06:59:59.000Z');
  });
});
