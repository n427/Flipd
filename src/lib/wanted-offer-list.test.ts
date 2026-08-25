import { describe, expect, it } from 'vitest';
import { parseWantedOfferRole, wantedOfferParticipantColumn } from './wanted-offer-list';

describe('Wanted offer collection contract', () => {
  it('accepts only buyer and seller roles', () => {
    expect(parseWantedOfferRole('buyer')).toBe('buyer');
    expect(parseWantedOfferRole('seller')).toBe('seller');
    expect(parseWantedOfferRole('admin')).toBeNull();
    expect(parseWantedOfferRole(null)).toBeNull();
  });

  it('always scopes list queries to the authenticated participant column', () => {
    expect(wantedOfferParticipantColumn('buyer')).toBe('buyer_id');
    expect(wantedOfferParticipantColumn('seller')).toBe('seller_id');
  });
});
