import { describe, expect, it } from 'vitest';
import { isCurrentWantedOfferLoad, isCurrentWantedRequest } from './wantedRequestState';

describe('Wanted request generations', () => {
  it('rejects a response as soon as visible filters advance', () => {
    expect(isCurrentWantedRequest({ generation: 2 }, { generation: 1 })).toBe(false);
  });

  it('rejects stale pagination even when its cursor matches again', () => {
    expect(isCurrentWantedRequest({ generation: 3, direction: 'sent', cursor: 'same' }, { generation: 2, direction: 'sent', cursor: 'same' })).toBe(false);
    expect(isCurrentWantedRequest({ generation: 3, direction: 'sent', cursor: 'same' }, { generation: 3, direction: 'received', cursor: 'same' })).toBe(false);
  });

  it('rejects both old success and old error after an offer route-mode transition', () => {
    const current = { key: 'offer-2', generation: 2 };
    const old = { key: 'new', generation: 1 };
    expect(isCurrentWantedOfferLoad(current, old, false)).toBe(false);
    expect(isCurrentWantedOfferLoad(current, old, true)).toBe(false);
    expect(isCurrentWantedOfferLoad(current, current, false)).toBe(true);
  });
});
