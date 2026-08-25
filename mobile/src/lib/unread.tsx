import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useSession } from './session';
import { fetchUnreadCount, countNewListingsSince } from './listings';
import { registerForPush } from './push';
import { fetchWantedNotifications, fetchWantedOffers, updateWantedNotifications } from './wanted';
import { fetchThreads } from './messages';
import { countWantedUnreadAttention } from './wantedUnread';
import { mergeWantedUnreadSnapshot, type WantedUnreadSnapshot } from './unreadState';

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
  const refreshGeneration = useRef(0);
  const wantedSnapshot = useRef<WantedUnreadSnapshot>({ offers: [], events: [], unreadChatOfferIds: [] });
  const snapshotUserId = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    const userId = user?.id ?? null;
    if (snapshotUserId.current !== userId) {
      snapshotUserId.current = userId;
      wantedSnapshot.current = { offers: [], events: [], unreadChatOfferIds: [] };
      eventsSeenAt.current = new Date(0).toISOString();
    }
    if (!user) {
      setCount(0);
      setEventsCount(0);
      return;
    }
    const [c, listingEvents, wantedEvents, received, threads] = await Promise.allSettled([
      fetchUnreadCount(),
      countNewListingsSince(eventsSeenAt.current, user.id),
      fetchWantedNotifications(),
      fetchAllReceivedWantedOffers(),
      fetchThreads(),
    ]);
    if (generation !== refreshGeneration.current) return;
    const next = mergeWantedUnreadSnapshot(wantedSnapshot.current, {
      offers: received.status === 'fulfilled' ? received.value : undefined,
      events: wantedEvents.status === 'fulfilled' ? wantedEvents.value : undefined,
      unreadChatOfferIds: threads.status === 'fulfilled'
        ? threads.value.filter((thread) => thread.unread && thread.wanted_offer_id)
          .map((thread) => thread.wanted_offer_id as string)
        : undefined,
    });
    wantedSnapshot.current = next;
    if (c.status === 'fulfilled') setCount(c.value);
    const listingCount = listingEvents.status === 'fulfilled' ? listingEvents.value : 0;
    setEventsCount(listingCount + countWantedUnreadAttention(next.offers, next.events, next.unreadChatOfferIds));
  }, [user]);

  // Opening the bell tab clears the dot until newer listings appear.
  const markEventsSeen = useCallback(() => {
    eventsSeenAt.current = new Date().toISOString();
    setEventsCount(0);
    const ids = wantedSnapshot.current.events.filter((event) => !event.read_at).map((event) => event.id);
    const readAt = new Date().toISOString();
    wantedSnapshot.current = {
      ...wantedSnapshot.current,
      events: wantedSnapshot.current.events.map((event) => ({ ...event, read_at: event.read_at ?? readAt })),
    };
    if (ids.length > 0) void updateWantedNotifications(ids, 'read').catch(() => {});
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
