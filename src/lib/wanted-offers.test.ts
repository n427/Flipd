import { describe, expect, it } from 'vitest';
import {
  canMutateWantedOffer,
  hasWantedOfferPhotoPrefix,
  parseWantedOfferInput,
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
});
