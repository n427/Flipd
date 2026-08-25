type Offer = { id: string; status: string };
type Event = {
  id?: string;
  event_type: string;
  wanted_offer_id: string | null;
  read_at: string | null;
  dismissed_at: string | null;
};

/** Counts each offer at most once and lets unread accepted chats own attention. */
export function countWantedUnreadAttention(
  receivedOffers: Offer[],
  events: Event[],
  unreadChatOfferIds: Iterable<string>,
): number {
  const chatIds = new Set(unreadChatOfferIds);
  const offerIds = new Set(
    receivedOffers.filter((offer) => offer.status === 'pending').map((offer) => offer.id),
  );
  let standaloneEvents = 0;
  for (const event of events) {
    if (event.read_at || event.dismissed_at) continue;
    if (event.wanted_offer_id && chatIds.has(event.wanted_offer_id)) continue;
    if (event.event_type === 'new-offer' && event.wanted_offer_id) offerIds.add(event.wanted_offer_id);
    else standaloneEvents += 1;
  }
  for (const id of chatIds) offerIds.delete(id);
  return offerIds.size + standaloneEvents;
}
