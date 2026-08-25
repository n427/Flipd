import { describe, expect, it } from 'vitest';
import { losAngelesEndOfDayUtc, referencePhotoPath, wantedActionState, wantedCardCopy, wantedOfferActions, wantedOfferStatusLabel } from './wantedPresentation';

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

  it('allows resubmission only from a seller withdrawn offer', () => {
    expect(wantedActionState({ owner: false, postStatus: 'active', offerStatus: 'withdrawn', offerRole: 'seller' })).toEqual({ kind: 'make-offer', label: 'Send another offer' });
    expect(wantedActionState({ owner: false, postStatus: 'active', offerStatus: 'declined', offerRole: 'seller' })).toEqual({ kind: 'disabled', label: 'Offer declined' });
    expect(wantedActionState({ owner: false, postStatus: 'active', offerStatus: 'expired', offerRole: 'seller' })).toEqual({ kind: 'disabled', label: 'Offer expired' });
    expect(wantedActionState({ owner: false, postStatus: 'active', offerStatus: 'accepted', offerRole: 'seller' })).toEqual({ kind: 'disabled', label: 'Offer accepted' });
  });

  it('exposes only valid offer actions', () => {
    expect(wantedActionState({ owner: false, postStatus: 'active', offerStatus: 'pending', offerRole: 'seller' })).toEqual({ kind: 'edit-offer', label: 'Edit offer' });
    expect(wantedActionState({ owner: true, postStatus: 'active', offerStatus: 'pending', offerRole: 'buyer' })).toEqual({ kind: 'accept-offer', label: 'Accept & open chat' });
    expect(wantedActionState({ owner: false, postStatus: 'fulfilled', offerStatus: 'accepted', offerRole: 'seller', threadId: 't1' })).toEqual({ kind: 'open-chat', label: 'Open chat', threadId: 't1' });
  });

  it('converts LA end-of-day across daylight time', () => {
    expect(losAngelesEndOfDayUtc('2026-08-25')).toBe('2026-08-26T06:59:59.000Z');
  });

  it('derives offer actions from authoritative post and completion state', () => {
    expect(wantedOfferActions({ role: 'buyer', offerStatus: 'pending', postStatus: 'active', neededBy: '2026-09-01T06:59:59Z' }, new Date('2026-08-25T00:00:00Z'))).toEqual(['accept', 'decline', 'report']);
    expect(wantedOfferActions({ role: 'seller', offerStatus: 'pending', postStatus: 'expired', neededBy: '2026-08-24T06:59:59Z' }, new Date('2026-08-25T00:00:00Z'))).toEqual(['report']);
    expect(wantedOfferActions({ role: 'seller', offerStatus: 'accepted', postStatus: 'fulfilled', neededBy: '2026-09-01T06:59:59Z', completedAt: null, threadId: 't1' })).toEqual(['chat', 'complete', 'report']);
    expect(wantedOfferActions({ role: 'buyer', offerStatus: 'accepted', postStatus: 'fulfilled', neededBy: '2026-09-01T06:59:59Z', completedAt: '2026-08-26T00:00:00Z', threadId: 't1' })).toEqual(['chat', 'rate', 'report']);
    expect(wantedOfferActions({ role: 'buyer', offerStatus: 'accepted', postStatus: 'fulfilled', neededBy: '2026-09-01T06:59:59Z', completedAt: '2026-08-26T00:00:00Z', threadId: 't1', canRate: false })).toEqual(['chat', 'report']);
  });

  it('extracts only owned reference storage paths', () => {
    expect(referencePhotoPath('https://x.supabase.co/storage/v1/object/public/wanted-reference-photos/user-id/folder/photo.jpg', 'user-id')).toBe('user-id/folder/photo.jpg');
    expect(referencePhotoPath('https://x.supabase.co/storage/v1/object/public/wanted-reference-photos/other/photo.jpg', 'user-id')).toBeNull();
  });
});
