export type WantedRequestIdentity = { generation: number; direction?: string; cursor?: string | null };

export function isCurrentWantedRequest(current: WantedRequestIdentity, request: WantedRequestIdentity): boolean {
  return current.generation === request.generation
    && (request.direction === undefined || current.direction === request.direction)
    && (request.cursor === undefined || current.cursor === request.cursor);
}
