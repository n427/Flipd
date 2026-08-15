import { describe, it, expect } from 'vitest';
import { dueRequests, type RequestRow } from './due-requests';

const NOW = new Date('2026-08-12T12:00:00Z');
const HOUR = 60 * 60 * 1000;
const at = (offsetHours: number) => new Date(NOW.getTime() + offsetHours * HOUR).toISOString();

function row(over: Partial<RequestRow> = {}): RequestRow {
  return {
    id: 'r1',
    buyer_id: 'buyer',
    seller_id: 'seller',
    listing_id: 'listing',
    status: 'pending',
    expires_at: at(48),
    reminded_at: null,
    ...over,
  };
}

describe('dueRequests', () => {
  it('ignores a request that is not close to expiring', () => {
    expect(dueRequests([row({ expires_at: at(30) })], NOW)).toEqual([]);
  });

  it('reminds the seller once inside the 24h window', () => {
    const out = dueRequests([row({ expires_at: at(12) })], NOW);
    expect(out).toEqual([
      { kind: 'reminder', id: 'r1', sellerId: 'seller', buyerId: 'buyer', listingId: 'listing', hoursLeft: 12 },
    ]);
  });

  it('does not remind twice', () => {
    expect(dueRequests([row({ expires_at: at(12), reminded_at: at(-1) })], NOW)).toEqual([]);
  });

  it('expires a request past its deadline and notifies the buyer', () => {
    const out = dueRequests([row({ expires_at: at(-1) })], NOW);
    expect(out).toEqual([
      { kind: 'expiry', id: 'r1', buyerId: 'buyer', listingId: 'listing' },
    ]);
  });

  it('expires rather than reminds when both could apply', () => {
    // Past due and never reminded: a "12 hours left" email would be a lie.
    const out = dueRequests([row({ expires_at: at(-2), reminded_at: null })], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('expiry');
  });

  it.each(['approved', 'declined', 'expired', 'completed'])(
    'leaves a %s request alone',
    (status) => {
      expect(dueRequests([row({ status, expires_at: at(-5) })], NOW)).toEqual([]);
    },
  );

  it('skips a row whose deadline cannot be parsed rather than expiring it', () => {
    expect(dueRequests([row({ expires_at: 'not-a-date' })], NOW)).toEqual([]);
  });

  it('rounds hoursLeft to at least 1 so an email never says "0 hours"', () => {
    const out = dueRequests([row({ expires_at: at(0.2) })], NOW);
    expect(out[0]).toMatchObject({ kind: 'reminder', hoursLeft: 1 });
  });
});
