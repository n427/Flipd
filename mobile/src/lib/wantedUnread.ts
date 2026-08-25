type Offer = { id: string; status: string };
type Event = { id?: string; event_type: string; wanted_offer_id: string | null; read_at: string | null; dismissed_at: string | null };

export function countWantedUnreadAttention(offers: Offer[], events: Event[], unreadChatOfferIds: Iterable<string>): number {
  const chats = new Set(unreadChatOfferIds);
  const ids = new Set(offers.filter((offer) => offer.status === 'pending').map((offer) => offer.id));
  let standaloneEvents = 0;
  for (const event of events) {
    if (event.read_at || event.dismissed_at) continue;
    if (event.wanted_offer_id && chats.has(event.wanted_offer_id)) continue;
    if (event.event_type === 'new-offer' && event.wanted_offer_id) ids.add(event.wanted_offer_id);
    else standaloneEvents += 1;
  }
  for (const id of chats) ids.delete(id);
  return ids.size + standaloneEvents;
}
