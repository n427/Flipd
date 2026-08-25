import { describe, expect, it } from 'vitest';
import { parseTransactionSource } from './wanted-transition';

describe('transaction sources', () => {
  it('accepts exactly one source', () => {
    expect(parseTransactionSource({ request_id: 'sale-1', wanted_offer_id: null })).toEqual({
      kind: 'sale',
      id: 'sale-1',
    });
    expect(parseTransactionSource({ request_id: null, wanted_offer_id: 'offer-1' })).toEqual({
      kind: 'wanted',
      id: 'offer-1',
    });
  });

  it('rejects zero or two sources', () => {
    expect(parseTransactionSource({ request_id: null, wanted_offer_id: null })).toBeNull();
    expect(parseTransactionSource({ request_id: 'sale-1', wanted_offer_id: 'offer-1' })).toBeNull();
  });
});
