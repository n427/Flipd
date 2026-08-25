import type { WantedOfferDirection } from './wanted-client';

export type WantedOfferInboxState<T> = { direction: WantedOfferDirection; generation: number; items?: T[] };
export type WantedOfferInboxRequest = { direction: WantedOfferDirection; generation: number };

export function beginWantedOfferInboxRequest<T>(state: WantedOfferInboxState<T>, direction: WantedOfferDirection): WantedOfferInboxState<T> {
  return { direction, generation: state.generation + 1, items: direction === state.direction ? state.items : undefined };
}

export function applyWantedOfferInboxResponse<T>(
  state: WantedOfferInboxState<T>, request: WantedOfferInboxRequest, items: T[], append: boolean,
): WantedOfferInboxState<T> {
  if (request.direction !== state.direction || request.generation !== state.generation) return state;
  return { ...state, items: append ? [...(state.items ?? []), ...items] : items };
}
