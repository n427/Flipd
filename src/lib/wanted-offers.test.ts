import { describe, expect, it } from 'vitest';
import {
  canMutateWantedOffer,
  canonicalizeWantedOfferId,
  hasWantedOfferPhotoPrefix,
  parseWantedOfferInput,
  wantedOfferRpcErrorStatus,
} from './wanted-offers';

describe('Wanted offers', () => {
  it('requires price, description, message, and one to six private photo paths', () => {
    expect(parseWantedOfferInput({
      price: 70,
      description: 'Good condition',
      message: 'Can meet Friday',
      photo_paths: ['seller/offer/photo.jpg'],
    }).ok).toBe(true);
    expect(parseWantedOfferInput({
      price: 70,
      description: '',
      message: 'Can meet Friday',
      photo_paths: [],
    }).ok).toBe(false);
  });

  it('allows edits and withdrawal only while pending', () => {
    expect(canMutateWantedOffer('pending')).toBe(true);
    expect(canMutateWantedOffer('accepted')).toBe(false);
    expect(canMutateWantedOffer('declined')).toBe(false);
  });

  it('requires every private photo to use the seller and offer prefix exactly', () => {
    expect(hasWantedOfferPhotoPrefix(
      ['seller-id/offer-id/front.jpg', 'seller-id/offer-id/back.jpg'],
      'seller-id',
      'offer-id',
    )).toBe(true);
    expect(hasWantedOfferPhotoPrefix(['seller-id/other-offer/front.jpg'], 'seller-id', 'offer-id')).toBe(false);
    expect(hasWantedOfferPhotoPrefix(['another-seller/offer-id/front.jpg'], 'seller-id', 'offer-id')).toBe(false);
    expect(hasWantedOfferPhotoPrefix(['seller-id/offer-id'], 'seller-id', 'offer-id')).toBe(false);
  });

  it('canonicalizes client offer IDs before their paths or database row are used', () => {
    const rawId = 'A4000000-0000-4000-8000-000000000001';
    const canonicalId = 'a4000000-0000-4000-8000-000000000001';
    expect(canonicalizeWantedOfferId(rawId)).toBe(canonicalId);
    expect(hasWantedOfferPhotoPrefix([`seller/${canonicalId}/front.jpg`], 'seller', canonicalId)).toBe(true);
    expect(hasWantedOfferPhotoPrefix([`seller/${rawId}/front.jpg`], 'seller', canonicalId)).toBe(false);
    expect(canonicalizeWantedOfferId('not-a-uuid')).toBeNull();
  });

  it('maps transactional offer errors without exposing database details', () => {
    expect(wantedOfferRpcErrorStatus({ code: 'P0002' })).toBe(404);
    expect(wantedOfferRpcErrorStatus({ code: '42501' })).toBe(403);
    expect(wantedOfferRpcErrorStatus({ code: 'P0001' })).toBe(409);
    expect(wantedOfferRpcErrorStatus({ code: '40P01' })).toBe(409);
    expect(wantedOfferRpcErrorStatus({ code: '55P03' })).toBe(503);
    expect(wantedOfferRpcErrorStatus({ code: 'XX000' })).toBe(500);
  });
});
