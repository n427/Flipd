import { describe, expect, it } from 'vitest';
import { applyWantedOfferInboxResponse, beginWantedOfferInboxRequest } from './wanted-offer-inbox';

describe('Wanted offer inbox request generations', () => {
  it('ignores stale initial and load-more responses after direction changes', () => {
    const first = beginWantedOfferInboxRequest({ direction: 'received', generation: 1 }, 'received');
    const switched = beginWantedOfferInboxRequest(first, 'sent');
    expect(applyWantedOfferInboxResponse(switched, { direction: 'received', generation: first.generation }, ['old'], false)).toBe(switched);
    expect(applyWantedOfferInboxResponse(switched, { direction: 'sent', generation: switched.generation }, ['new'], false).items).toEqual(['new']);
    expect(applyWantedOfferInboxResponse(switched, { direction: 'sent', generation: first.generation }, ['stale-more'], true)).toBe(switched);
  });

  it('merges current-generation load-more responses', () => {
    const state = { direction: 'sent' as const, generation: 4, items: ['one'] };
    expect(applyWantedOfferInboxResponse(state, { direction: 'sent', generation: 4 }, ['two'], true).items).toEqual(['one', 'two']);
  });
});
