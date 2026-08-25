import { describe, expect, it } from 'vitest';
import { parseWantedOfferCursor, parseWantedOfferRole, serializeWantedOfferCursor, wantedOfferComesAfterCursor, wantedOfferParticipantColumn } from './wanted-offer-list';

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

  it('uses a deterministic timestamp and UUID cursor for tied rows', () => {
    const cursor = { created_at: '2026-08-25T12:00:00.000Z', id: 'a4000000-0000-4000-8000-000000000002' };
    const encoded = serializeWantedOfferCursor(cursor);
    expect(parseWantedOfferCursor(encoded)).toEqual(cursor);
    expect(wantedOfferComesAfterCursor({ ...cursor, id: 'a4000000-0000-4000-8000-000000000001' }, cursor)).toBe(true);
    expect(wantedOfferComesAfterCursor({ ...cursor, id: 'a4000000-0000-4000-8000-000000000003' }, cursor)).toBe(false);
    expect(parseWantedOfferCursor('bad')).toBeNull();
  });
});
