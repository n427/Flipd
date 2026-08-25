export type WantedRequestIdentity = { generation: number; direction?: string; cursor?: string | null };

export function isCurrentWantedRequest(current: WantedRequestIdentity, request: WantedRequestIdentity): boolean {
  return current.generation === request.generation
    && (request.direction === undefined || current.direction === request.direction)
    && (request.cursor === undefined || current.cursor === request.cursor);
}

export function isCurrentWantedOfferLoad(
  current: WantedOfferScreenIdentity,
  request: WantedOfferScreenIdentity,
  cancelled: boolean,
): boolean {
  return !cancelled
    && current.mounted
    && request.mounted
    && current.postId === request.postId
    && current.mode === request.mode
    && current.generation === request.generation;
}

export type WantedOfferScreenIdentity = {
  postId: string;
  mode: string;
  generation: number;
  mounted: boolean;
};
