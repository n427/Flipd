export type WantedUnreadSnapshot = {
  offers: { id: string; status: string }[];
  events: { id: string; event_type: string; wanted_offer_id: string | null; read_at: string | null; dismissed_at: string | null }[];
  unreadChatOfferIds: string[];
};

export function mergeWantedUnreadSnapshot(
  previous: WantedUnreadSnapshot,
  update: { [K in keyof WantedUnreadSnapshot]: WantedUnreadSnapshot[K] | undefined },
): WantedUnreadSnapshot {
  return {
    offers: update.offers ?? previous.offers,
    events: update.events ?? previous.events,
    unreadChatOfferIds: update.unreadChatOfferIds ?? previous.unreadChatOfferIds,
  };
}
