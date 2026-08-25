import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useSession } from './session';
import { fetchUnreadCount, countNewListingsSince } from './listings';
import { registerForPush } from './push';
import { fetchWantedNotifications, fetchWantedOffers, updateWantedNotifications } from './wanted';
import { fetchThreads } from './messages';
import { countWantedUnreadAttention } from './wantedUnread';

type Ctx = {
  count: number; // unread reveal requests → chat badge
  refresh: () => void;
  eventsCount: number; // new listings since last opening the bell tab → dot
  markEventsSeen: () => void;
};
const UnreadContext = createContext<Ctx>({ count: 0, refresh: () => {}, eventsCount: 0, markEventsSeen: () => {} });

const POLL_MS = 60_000;

async function fetchAllReceivedWantedOffers() {
  const offers: Awaited<ReturnType<typeof fetchWantedOffers>>['wanted_offers'] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await fetchWantedOffers('received', cursor);
    offers.push(...page.wanted_offers);
    if (!page.next_cursor || seenCursors.has(page.next_cursor)) break;
    seenCursors.add(page.next_cursor);
    cursor = page.next_cursor;
  } while (cursor);
  return offers;
}

// Tracks the unread-reveals count (chat badge) and new-listing events (bell
// dot). Polls on a timer, on app-foreground, and on demand.
export function UnreadProvider({ children }: { children: React.ReactNode }) {
  const { user } = useSession();
  const [count, setCount] = useState(0);
  const [eventsCount, setEventsCount] = useState(0);
  const eventsSeenAt = useRef<string>(new Date(0).toISOString());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setCount(0);
      setEventsCount(0);
      return;
    }
    const [c, listingEvents, wantedEvents, received, threads] = await Promise.all([
      fetchUnreadCount(),
      countNewListingsSince(eventsSeenAt.current, user.id),
      fetchWantedNotifications().catch(() => []),
      fetchAllReceivedWantedOffers().catch(() => []),
      fetchThreads().catch(() => []),
    ]);
    setCount(c);
    const unreadChatOfferIds = threads
      .filter((thread) => thread.unread && thread.wanted_offer_id)
      .map((thread) => thread.wanted_offer_id as string);
    setEventsCount(listingEvents + countWantedUnreadAttention(received, wantedEvents, unreadChatOfferIds));
  }, [user]);

  // Opening the bell tab clears the dot until newer listings appear.
  const markEventsSeen = useCallback(() => {
    eventsSeenAt.current = new Date().toISOString();
    setEventsCount(0);
    void fetchWantedNotifications()
      .then((events) => events.filter((event) => !event.read_at).map((event) => event.id))
      .then((ids) => ids.length > 0 ? updateWantedNotifications(ids, 'read') : undefined)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    timer.current = setInterval(refresh, POLL_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => {
      if (timer.current) clearInterval(timer.current);
      sub.remove();
    };
  }, [refresh]);

  // Register silently only when permission is already granted. The Feed owns
  // the contextual explainer that may open the native prompt.
  useEffect(() => {
    if (user) void registerForPush(user.id, { requestPermission: false });
  }, [user]);

  return (
    <UnreadContext.Provider value={{ count, refresh, eventsCount, markEventsSeen }}>{children}</UnreadContext.Provider>
  );
}

export const useUnread = () => useContext(UnreadContext);
