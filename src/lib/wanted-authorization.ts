import type { WantedOfferStatus, WantedPostStatus } from './wanted-contract';

export type WantedActor = 'owner' | 'seller' | 'stranger';
export type WantedAuthorizationContext = {
  actor: WantedActor;
  postStatus: WantedPostStatus;
  offerStatus: WantedOfferStatus | null;
  blocked: boolean;
  offerCompleted: boolean;
  competingAccepted: boolean;
};

export type WantedPermissions = {
  viewPost: boolean;
  viewOffer: boolean;
  submit: boolean;
  editPost: boolean;
  editOffer: boolean;
  withdraw: boolean;
  decline: boolean;
  accept: boolean;
  complete: boolean;
  rate: boolean;
  reportPost: boolean;
  reportOffer: boolean;
};

/**
 * One fail-closed policy for every Wanted route. `postStatus` must already be
 * the effective status (so an elapsed active row is supplied as `expired`).
 * Reporting remains available after a block so users can report the incident.
 */
export function wantedPermissions(context: WantedAuthorizationContext): WantedPermissions {
  const participant = context.actor === 'owner' || context.actor === 'seller';
  const live = context.postStatus === 'active';
  const acceptedParticipant = participant && context.offerStatus === 'accepted';
  const privateAccess = participant && context.offerStatus !== null && !context.blocked;
  const pending = context.offerStatus === 'pending' && live && !context.competingAccepted;

  return {
    viewPost: context.actor === 'owner' || (!context.blocked && (live || acceptedParticipant)),
    viewOffer: privateAccess,
    submit: context.actor !== 'owner' && live && !context.blocked && !context.competingAccepted
      && (context.offerStatus === null || context.offerStatus === 'withdrawn'),
    editPost: context.actor === 'owner' && live,
    editOffer: context.actor === 'seller' && pending && !context.blocked,
    withdraw: context.actor === 'seller' && pending && !context.blocked,
    decline: context.actor === 'owner' && pending && !context.blocked,
    accept: context.actor === 'owner' && pending && !context.blocked,
    complete: acceptedParticipant && !context.offerCompleted && !context.blocked,
    rate: acceptedParticipant && context.offerCompleted && !context.blocked,
    reportPost: true,
    reportOffer: participant && context.offerStatus !== null,
  };
}
