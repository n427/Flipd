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
    const current = { postId: 'post-a', mode: 'offer-2', generation: 2, mounted: true };
    const old = { postId: 'post-a', mode: 'new', generation: 1, mounted: true };
    expect(isCurrentWantedOfferLoad(current, old, false)).toBe(false);
    expect(isCurrentWantedOfferLoad(current, old, true)).toBe(false);
    expect(isCurrentWantedOfferLoad(current, current, false)).toBe(true);
  });

  it('rejects async work from another post even when both routes are new-offer mode', () => {
    const old = { postId: 'post-a', mode: 'new', generation: 4, mounted: true };
    const current = { postId: 'post-b', mode: 'new', generation: 4, mounted: true };
    expect(isCurrentWantedOfferLoad(current, old, false)).toBe(false);
  });

  it('rejects async work after the offer screen unmounts', () => {
    const request = { postId: 'post-a', mode: 'new', generation: 4, mounted: true };
    expect(isCurrentWantedOfferLoad({ ...request, mounted: false }, request, false)).toBe(false);
  });
});
