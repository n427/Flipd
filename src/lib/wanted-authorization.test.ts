import { describe, expect, it } from 'vitest';
import { wantedPermissions, type WantedAuthorizationContext } from './wanted-authorization';

const base: WantedAuthorizationContext = {
  actor: 'stranger', postStatus: 'active', offerStatus: null,
  blocked: false, offerCompleted: false, competingAccepted: false,
};

const cases: Array<{ name: string; context: Partial<WantedAuthorizationContext>; allowed: string[] }> = [
  { name: 'owner', context: { actor: 'owner' }, allowed: ['viewPost', 'editPost', 'reportPost'] },
  { name: 'owner with pending offer', context: { actor: 'owner', offerStatus: 'pending' }, allowed: ['viewPost', 'viewOffer', 'editPost', 'decline', 'accept', 'reportPost', 'reportOffer'] },
  { name: 'seller with pending offer', context: { actor: 'seller', offerStatus: 'pending' }, allowed: ['viewPost', 'viewOffer', 'editOffer', 'withdraw', 'reportPost', 'reportOffer'] },
  { name: 'seller resubmitting withdrawn offer', context: { actor: 'seller', offerStatus: 'withdrawn' }, allowed: ['viewPost', 'viewOffer', 'submit', 'reportPost', 'reportOffer'] },
  { name: 'stranger', context: {}, allowed: ['viewPost', 'submit', 'reportPost'] },
  { name: 'same-direction owner block', context: { actor: 'owner', offerStatus: 'pending', blocked: true }, allowed: ['viewPost', 'editPost', 'reportPost', 'reportOffer'] },
  { name: 'reverse-direction seller block', context: { actor: 'seller', offerStatus: 'pending', blocked: true }, allowed: ['reportPost', 'reportOffer'] },
  { name: 'expired post', context: { postStatus: 'expired' }, allowed: ['reportPost'] },
  { name: 'deleted owner post', context: { actor: 'owner', postStatus: 'deleted' }, allowed: ['viewPost', 'reportPost'] },
  { name: 'fulfilled owner and accepted offer', context: { actor: 'owner', postStatus: 'fulfilled', offerStatus: 'accepted' }, allowed: ['viewPost', 'viewOffer', 'complete', 'reportPost', 'reportOffer'] },
  { name: 'fulfilled seller and accepted offer', context: { actor: 'seller', postStatus: 'fulfilled', offerStatus: 'accepted' }, allowed: ['viewPost', 'viewOffer', 'complete', 'reportPost', 'reportOffer'] },
  { name: 'completed accepted offer', context: { actor: 'seller', postStatus: 'fulfilled', offerStatus: 'accepted', offerCompleted: true }, allowed: ['viewPost', 'viewOffer', 'rate', 'reportPost', 'reportOffer'] },
  { name: 'competing declined offer', context: { actor: 'seller', postStatus: 'fulfilled', offerStatus: 'declined', competingAccepted: true }, allowed: ['viewOffer', 'reportPost', 'reportOffer'] },
];

describe('Wanted authorization matrix', () => {
  it.each(cases)('$name', ({ context, allowed }) => {
    const permissions = wantedPermissions({ ...base, ...context });
    expect(Object.entries(permissions).filter(([, value]) => value).map(([key]) => key)).toEqual(allowed);
  });
});
