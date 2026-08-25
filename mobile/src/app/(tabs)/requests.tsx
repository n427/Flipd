import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator, RefreshControl, Alert, TextInput } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ListRowsSkeleton } from '@/components/Skeletons';
import { Sheet, SheetGrabber } from '@/components/Sheet';
import { SafetyCard } from '@/components/SafetyCard';
import { fetchThreads, ThreadSummary } from '@/lib/messages';
import { deleteThread } from '@/lib/conversationDeletion';
import { useSession } from '@/lib/session';
import { fetchSafetyReview, SafetyReview, fetchRequests, respondReveal, markRevealsSeen, submitRating, RevealRequest, rangeSince, FeedRange } from '@/lib/listings';
import { useUnread } from '@/lib/unread';
import { conversationThumbnail } from '@/lib/requestPresentation';
import { WantedOfferRow } from '@/components/WantedOfferRow';
import { acceptWantedOffer, completeWantedOffer, fetchWantedOffers, rateWantedOffer, reportWantedTarget, resolveWantedOffer, WantedOffer } from '@/lib/wanted';
import { ReportForm } from '@/components/ReportForm';
import { T, F, S } from '@/lib/theme';

// Status → label + colors (badge).

const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  pending: { label: 'Pending', bg: '#FFF3D6', fg: '#8A6D1A' },
  approved: { label: 'Approved', bg: '#E4F3E7', fg: '#1E6B33' },
  completed: { label: 'Completed', bg: '#E4F3E7', fg: '#1E6B33' },
  declined: { label: 'Declined', bg: '#F3E4E4', fg: '#8A2222' },
  expired: { label: 'Expired', bg: '#EEEDEA', fg: '#7A756C' },
};

function Badge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, bg: T.fieldbg, fg: T.muted };
  return (
    <View style={{ backgroundColor: s.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ fontFamily: F.semibold, fontSize: 12, color: s.fg }}>{s.label}</Text>
    </View>
  );
}

// Finished business: still listed, but no longer counted in a tab badge.
// Mirrors the RESOLVED set the web inbox already uses, plus 'completed', which
// is just as done as the other two.
const RESOLVED = new Set(['declined', 'expired', 'completed']);

// Offered when declining. Matches DECLINE_REASONS in the reveals API.
const DECLINE_REASONS = [
  { id: 'bad_timing', label: 'Bad timing' },
  { id: 'already_sold', label: 'Already sold' },
  { id: 'not_enough_info', label: 'Not enough info' },
] as const;

function Row({
  item,
  onPress,
  onRespond,
  onReview,
  onComplete,
  onRate,
  onOpenChat,
  busy,
}: {
  item: RevealRequest;
  onPress: () => void;
  onOpenChat?: (threadId: string) => void;
  // Incoming rows only: open the AI review of whoever is asking.
  onReview?: () => void;
  // Present only on incoming rows the current user can act on.
  onRespond?: (action: 'approve' | 'decline') => void;
  onComplete?: () => void;
  onRate?: () => void;
  busy?: boolean;
}) {
  const canApprove = !!onRespond && item.status === 'pending';
  // Declining outlives approval. Agreeing to talk is not agreeing to sell, and
  // previously an approved request could only be completed — never closed.
  const canDecline = !!onRespond && (item.status === 'pending' || item.status === 'approved');
  // Either party can close out an approved deal.
  const canComplete = !!onComplete && item.status === 'approved';
  const hasSecondaryActions = canApprove || canDecline || canComplete || Boolean(item.can_rate && onRate);
  const sub = [item.counterpart?.display_name, item.offer != null ? `Offer $${item.offer}` : null]
    .filter(Boolean)
    .join(' · ');

  // One padded card per request rather than a stack of full-bleed strips: the
  // actions belong to the request, so they sit inside its card.
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: T.rule,
        marginBottom: 12,
        padding: 16,
      }}
    >
      <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontFamily: F.extrabold, fontSize: 17, color: T.ink, letterSpacing: -0.3 }}>
            {item.listing_title || 'A listing'}
          </Text>
          {sub ? (
            <Text numberOfLines={1} style={{ fontFamily: F.regular, fontSize: 13.5, color: T.muted, marginTop: 3 }}>
              {sub}
            </Text>
          ) : null}
        </View>
        <Badge status={item.status} />
      </Pressable>

      {/* The buyer's own words: the basis for the seller's decision, and for
          services the only way to know what is actually being asked for. */}
      {item.intro_message ? (
        <Text style={{ fontFamily: F.regular, fontSize: 15, lineHeight: 22, color: T.ink, marginTop: 12 }}>
          {item.intro_message}
        </Text>
      ) : null}

      {canApprove && onReview ? (
        <Pressable
          onPress={onReview}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            marginTop: 14,
            paddingVertical: 11,
            borderRadius: 12,
            backgroundColor: T.fieldbg,
          }}
        >
          <Ionicons name="sparkles-outline" size={14} color={T.cardinal} />
          <Text style={{ fontFamily: F.bold, fontSize: 13.5, color: T.cardinal }}>Review profile</Text>
        </Pressable>
      ) : null}

      {item.thread_id ? (
        <Pressable
          onPress={() => onOpenChat?.(item.thread_id!)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            backgroundColor: T.cardinal,
            borderRadius: 12,
            paddingVertical: 13,
            marginTop: 14,
          }}
        >
          <Ionicons name="chatbubble-outline" size={16} color="#fff" />
          <Text style={{ fontFamily: F.bold, fontSize: 14.5, color: '#fff' }}>Open chat</Text>
        </Pressable>
      ) : null}

      {/* The two decision/status actions stay together beneath Open chat. */}
      {item.thread_id || canApprove || canDecline || canComplete || (item.can_rate && onRate) ? (
        hasSecondaryActions ? <View style={{ flexDirection: 'row', gap: 10, marginTop: item.thread_id ? 10 : 14 }}>
          {canApprove ? (
            <Pressable
              onPress={() => onRespond!('approve')}
              disabled={busy}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: T.cardinal,
                borderRadius: 12,
                paddingVertical: 13,
                opacity: busy ? 0.5 : 1,
              }}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={{ fontFamily: F.bold, fontSize: 14.5, color: '#fff' }}>Approve</Text>
              )}
            </Pressable>
          ) : null}

          {canDecline ? (
            <Pressable
              onPress={() => onRespond!('decline')}
              disabled={busy}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 12,
                borderWidth: 1,
                borderColor: T.rule,
                paddingVertical: 13,
                opacity: busy ? 0.5 : 1,
              }}
            >
              <Text style={{ fontFamily: F.bold, fontSize: 14.5, color: T.muted }}>Decline</Text>
            </Pressable>
          ) : null}

          {canComplete ? (
            <Pressable
              onPress={onComplete}
              disabled={busy}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 12,
                borderWidth: 1,
                borderColor: T.rule,
                paddingVertical: 13,
                opacity: busy ? 0.5 : 1,
              }}
            >
              {busy ? (
                <ActivityIndicator size="small" color={T.ink} />
              ) : (
                <Text style={{ fontFamily: F.bold, fontSize: 14.5, color: T.ink }}>Mark complete</Text>
              )}
            </Pressable>
          ) : null}

          {item.can_rate && onRate ? (
            <Pressable
              onPress={onRate}
              disabled={busy}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: T.rule,
                paddingVertical: 13,
                opacity: busy ? 0.5 : 1,
              }}
            >
              <Ionicons name="star" size={15} color={T.gold} />
              <Text style={{ fontFamily: F.bold, fontSize: 14.5, color: T.ink }}>Rate</Text>
            </Pressable>
          ) : null}
        </View> : null
      ) : null}
    </View>
  );
}

// Same three tabs as the web page: conversations plus the two request
// directions, which are different jobs with different actions.
type Tab = 'conversations' | 'sale' | 'wanted';
type Direction = 'received' | 'sent';

const TABS: { id: Tab; label: string }[] = [
  { id: 'conversations', label: 'Conversations' },
  { id: 'sale', label: 'Sale requests' },
  { id: 'wanted', label: 'Wanted offers' },
];

// Same windows as the web page's "From" control.
const RANGES: { id: FeedRange; label: string; short: string }[] = [
  { id: 'day', label: 'Past 24 hours', short: '24 hours' },
  { id: 'week', label: 'Past week', short: 'Past week' },
  { id: 'month', label: 'Past month', short: 'Past month' },
  { id: 'all', label: 'All time', short: 'All time' },
];

export default function Requests() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string; direction?: string }>();
  const { user } = useSession();
  const { refresh: refreshBadge } = useUnread();
  const [incoming, setIncoming] = useState<RevealRequest[]>([]);
  const [outgoing, setOutgoing] = useState<RevealRequest[]>([]);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [tab, setTab] = useState<Tab>(params.tab === 'wanted' ? 'wanted' : params.tab === 'sale' ? 'sale' : 'conversations');
  const [direction, setDirection] = useState<Direction>(params.direction === 'sent' ? 'sent' : 'received');
  const [wantedReceived, setWantedReceived] = useState<WantedOffer[]>([]);
  const [wantedSent, setWantedSent] = useState<WantedOffer[]>([]);
  const [wantedNext, setWantedNext] = useState<{ received: string | null; sent: string | null }>({ received: null, sent: null });
  const wantedPaging = useRef(new Set<string>());
  const loadGeneration = useRef(0);
  const [wantedRating, setWantedRating] = useState<WantedOffer | null>(null);
  const [wantedReporting, setWantedReporting] = useState<WantedOffer | null>(null);
  const [wantedReportBusy, setWantedReportBusy] = useState(false);
  // Defaults to the past week, matching the web page.
  const [range, setRange] = useState<FeedRange>('month');
  const [rangeOpen, setRangeOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Confirmation sheet for completing a deal, and an inline error line —
  // both replace native Alerts, which felt out of place in the app.
  const [completing, setCompleting] = useState<RevealRequest | null>(null);
  const [deletingThread, setDeletingThread] = useState<ThreadSummary | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // AI review of the person who sent an incoming request, so a seller can
  // check who is asking before approving.
  const [reviewing, setReviewing] = useState<RevealRequest | null>(null);
  const [review, setReview] = useState<SafetyReview | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);

  const openReview = useCallback((item: RevealRequest) => {
    setReviewing(item);
    setReview(null);
    const id = item.counterpart?.id;
    if (!id) return;
    setReviewLoading(true);
    // The counterparty on an incoming request is the buyer.
    fetchSafetyReview(id, 'buyer')
      .then(setReview)
      .catch(() => setReview(null))
      .finally(() => setReviewLoading(false));
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    const generation = ++loadGeneration.current;
    try {
      setError(false);
      // Threads never fail the screen on their own — an empty list just
      // renders the conversations empty state.
      const [saleResult, threadResult, receivedResult, sentResult] = await Promise.allSettled([
        fetchRequests(user.id),
        fetchThreads(),
        fetchWantedOffers('received'),
        fetchWantedOffers('sent'),
      ]);
      if (generation !== loadGeneration.current) return;
      if (saleResult.status === 'fulfilled') { setIncoming(saleResult.value.incoming); setOutgoing(saleResult.value.outgoing); }
      if (threadResult.status === 'fulfilled') setThreads(threadResult.value);
      if (receivedResult.status === 'fulfilled') { setWantedReceived(receivedResult.value.wanted_offers); setWantedNext((all) => ({ ...all, received: receivedResult.value.next_cursor })); }
      if (sentResult.status === 'fulfilled') { setWantedSent(sentResult.value.wanted_offers); setWantedNext((all) => ({ ...all, sent: sentResult.value.next_cursor })); }
      if ([saleResult, threadResult, receivedResult, sentResult].some((result) => result.status === 'rejected')) {
        setError(true); setActionError('Some requests could not refresh. Tap here to retry.');
      }
    } catch (e) {
      if (generation !== loadGeneration.current) return;
      setError(true);
      if (__DEV__) console.warn('[requests] load failed:', e);
    }
  }, [user]);

  useEffect(() => {
    (async () => {
      await load();
      setLoading(false);
      // Viewing the list counts as seeing everything — clear the badge.
      await markRevealsSeen();
      refreshBadge();
    })();
  }, [load, refreshBadge]);

  useEffect(() => {
    if (params.tab === 'wanted' || params.tab === 'sale') setTab(params.tab);
    if (params.direction === 'received' || params.direction === 'sent') setDirection(params.direction);
  }, [params.tab, params.direction]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Seller approves or declines an incoming request. Approving opens a chat
  // both ways (the server emails both parties). Reload so the badge updates.
  const respond = useCallback(
    async (id: string, action: 'approve' | 'decline', declineReason?: string) => {
      setBusyId(id);
      setActionError(null);
      try {
        await respondReveal(id, action, false, declineReason);
        await load();
        refreshBadge();
      } catch (e) {
        // Inline, not a native alert: the row's own status is the confirmation,
        // so an error only needs to be visible, not blocking.
        setActionError(e instanceof Error ? e.message : 'Could not update. Try again.');
      } finally {
        setBusyId(null);
      }
    },
    [load, refreshBadge],
  );

  // One tap. Approving just opens the chat, so there is nothing to confirm —
  // marking a listing sold is a separate, deliberate action on the listing
  // itself rather than a branch hidden inside Approve.
  const onApprove = useCallback((id: string) => respond(id, 'approve'), [respond]);

  // Close out an approved deal. Once completed, both parties can rate.
  const onComplete = useCallback((item: RevealRequest) => setCompleting(item), []);

  const confirmComplete = useCallback(async () => {
    const item = completing;
    if (!item) return;
    setCompleting(null);
    setBusyId(item.id);
    setActionError(null);
    try {
      await respondReveal(item.id, 'complete');
      await load();
      refreshBadge();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not update. Try again.');
    } finally {
      setBusyId(null);
    }
  }, [completing, load, refreshBadge]);

  const confirmDeleteThread = useCallback(async () => {
    const thread = deletingThread;
    if (!thread) return;
    setDeletingThread(null);
    setBusyId(thread.id);
    setActionError(null);
    try {
      await deleteThread(thread.id);
      await load();
      refreshBadge();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not delete this conversation. Try again.');
    } finally {
      setBusyId(null);
    }
  }, [deletingThread, load, refreshBadge]);

  // --- Rating sheet ---
  const [rateFor, setRateFor] = useState<RevealRequest | null>(null);
  const [declining, setDeclining] = useState<RevealRequest | null>(null);
  const [score, setScore] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [savingRating, setSavingRating] = useState(false);

  const openRate = useCallback((item: RevealRequest) => {
    setRateFor(item);
    setScore(0);
    setReviewText('');
  }, []);

  const sendRating = async () => {
    if (!rateFor || score < 1) return;
    setSavingRating(true);
    try {
      const res = await submitRating(rateFor.id, score, reviewText);
      if (res.ok) {
        setRateFor(null);
        await load();
      } else if (res.status === 409) {
        // Already rated — close and refresh so the button disappears.
        setRateFor(null);
        await load();
        Alert.alert('Already rated', 'You’ve already rated this transaction.');
      } else {
        Alert.alert('Could not submit', res.error);
      }
    } catch (e) {
      Alert.alert('Could not submit', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setSavingRating(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
        <ListRowsSkeleton titleWidth={148} pills={3} />
      </SafeAreaView>
    );
  }

  // rangeSince gives an ISO cutoff; compare in ms. null means "all time".
  const sinceIso = rangeSince(range);
  const since = sinceIso ? new Date(sinceIso).getTime() : null;
  // A row with no/unparseable timestamp is kept rather than silently dropped.
  const inWindow = (iso: string | null | undefined) => {
    if (since == null || !iso) return true;
    const ms = new Date(iso).getTime();
    return !Number.isFinite(ms) || ms >= since;
  };

  const visibleIncoming = incoming.filter((r) => inWindow(r.created_at));
  const visibleOutgoing = outgoing.filter((r) => inWindow(r.created_at));
  // Conversations are bounded by their last message, so the control means the
  // same thing on every tab.
  const visibleThreads = threads.filter((t) => inWindow(t.last_message_at));

  // The tab badge counts requests that are still live. A declined, expired or
  // completed request is finished business, and counting it meant the number
  // beside "You sent" never moved when one was turned down. The rows still
  // list everything — the count is attention, the list is history.
  const isLive = (r: RevealRequest) => !RESOLVED.has(r.status);
  const counts: Record<Tab, number> = {
    conversations: visibleThreads.length,
    sale: [...visibleIncoming, ...visibleOutgoing].filter(isLive).length,
    wanted: [...wantedReceived, ...wantedSent].filter((offer) => offer.status === 'pending').length,
  };

  const rows = direction === 'received' ? visibleIncoming : visibleOutgoing;
  // Distinguishes "nothing here" from "nothing in the window you picked".
  const totalForTab =
    tab === 'conversations' ? threads.length : tab === 'wanted' ? (direction === 'received' ? wantedReceived.length : wantedSent.length) : direction === 'received' ? incoming.length : outgoing.length;
  const hiddenByRange = counts[tab] === 0 && totalForTab > 0;

  const emptyCopy = error
    ? 'Check your connection, then pull down to refresh.'
    : hiddenByRange
      ? 'Nothing in this window. Try a longer range.'
    : tab === 'conversations'
      ? 'Approved requests open a chat, and it lands here.'
      : tab === 'wanted'
        ? 'Private offers you receive or send appear here.'
      : direction === 'received'
        ? 'When someone asks about one of your listings, it shows up here.'
        : 'Requests you send to sellers show up here while you wait on a reply.';

  const emptyTitle = error
    ? 'Couldn’t load your requests'
    : hiddenByRange
      ? 'Nothing in this window'
    : tab === 'conversations'
      ? 'No conversations yet'
      : tab === 'wanted'
        ? 'No Wanted offers yet'
      : direction === 'received'
        ? 'Nobody’s asked yet'
        : 'You haven’t asked anyone yet';

  const listHeader = (
    <View style={{ paddingBottom: 14 }}>
      <Text style={{ fontFamily: F.black, fontSize: 26, color: T.ink, letterSpacing: -0.7 }}>Requests</Text>
      <Text style={{ fontFamily: F.regular, fontSize: 14.5, color: T.muted, marginTop: 5, lineHeight: 20 }}>
        Your conversations, and the requests waiting on a reply.
      </Text>

      {/* Segmented control rather than section headers: three destinations of
          equal weight, only one of which is relevant at a time. */}
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: T.fieldbg,
          borderRadius: 12,
          padding: 4,
          marginTop: 16,
        }}
      >
        {TABS.map((t) => {
          const on = tab === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => setTab(t.id)}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                paddingVertical: 9,
                borderRadius: 9,
                backgroundColor: on ? '#fff' : 'transparent',
                borderWidth: 1,
                borderColor: on ? T.rule : 'transparent',
              }}
            >
              <Text
                numberOfLines={1}
                style={{ fontFamily: on ? F.bold : F.medium, fontSize: 13, color: on ? T.ink : T.muted }}
              >
                {t.label}
              </Text>
              {counts[t.id] > 0 ? (
                <Text style={{ fontFamily: F.bold, fontSize: 13, color: on ? T.cardinal : T.muted }}>
                  {counts[t.id]}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {tab !== 'conversations' ? <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        {(['received', 'sent'] as Direction[]).map((item) => <Pressable key={item} accessibilityState={{ selected: direction === item }} onPress={() => setDirection(item)} style={{ flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10, backgroundColor: direction === item ? T.ink : T.fieldbg }}><Text style={{ fontFamily: F.bold, fontSize: 13, color: direction === item ? '#fff' : T.muted }}>{item === 'received' ? 'Received' : 'Sent'}</Text></Pressable>)}
      </View> : null}

      {/* Sits directly above the list it filters rather than competing with
          the tabs for the same row. */}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 }}>
        <Pressable
          onPress={() => setRangeOpen(true)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingVertical: 7,
            paddingHorizontal: 12,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: T.rule,
            backgroundColor: '#fff',
          }}
        >
          <Text style={{ fontFamily: F.medium, fontSize: 12.5, color: T.muted }}>From</Text>
          <Text style={{ fontFamily: F.bold, fontSize: 12.5, color: T.ink }}>
            {RANGES.find((r) => r.id === range)?.short}
          </Text>
          <Ionicons name="chevron-down" size={12} color={T.muted} />
        </Pressable>
      </View>
    </View>
  );

  const listEmpty = (
    <View style={{ paddingVertical: 48, alignItems: 'center' }}>
      <Text style={{ fontFamily: F.bold, fontSize: 17, color: T.ink, marginBottom: 6 }}>{emptyTitle}</Text>
      <Text style={{ fontFamily: F.regular, fontSize: 14, color: T.muted, textAlign: 'center', lineHeight: 20 }}>
        {emptyCopy}
      </Text>
      {error ? (
        <Pressable
          onPress={onRefresh}
          style={{ marginTop: 16, backgroundColor: T.cardinal, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 }}
        >
          <Text style={{ fontFamily: F.bold, color: '#fff' }}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );

  const listProps = {
    style: { backgroundColor: T.bg },
    contentContainerStyle: {
      paddingHorizontal: S.gutter,
      paddingTop: S.screenTop,
      paddingBottom: S.screenBottom,
    },
    refreshControl: <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />,
    ListHeaderComponent: listHeader,
    ListEmptyComponent: listEmpty,
  };

  return (
    <>
      <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
        {tab === 'conversations' ? (
          <FlatList
            {...listProps}
            data={visibleThreads}
            keyExtractor={(t) => t.id}
            renderItem={({ item }) => {
              const thumbnail = conversationThumbnail(item.listing_photo, item.counterpart?.avatar_url);
              return (
                <Pressable
                onPress={() => router.push(`/messages/${item.id}`)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: T.rule,
                  borderRadius: 16,
                  padding: 14,
                  marginBottom: 10,
                }}
              >
                <View style={{ width: 46, height: 46, borderRadius: 12, overflow: 'hidden', backgroundColor: T.fieldbg }}>
                  {thumbnail ? (
                    <Image source={{ uri: thumbnail }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  ) : (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="chatbubble-ellipses-outline" size={20} color={T.muted} />
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 15, color: T.ink }}>
                    {item.listing_title}
                  </Text>
                  <Text numberOfLines={1} style={{ fontFamily: F.regular, fontSize: 13, color: T.muted, marginTop: 2 }}>
                    {item.counterpart?.display_name || 'A Trojan'}
                    {item.last_message ? ` · ${item.last_message}` : ''}
                  </Text>
                </View>
                {/* Unread is the only thing worth a marker here; the row already
                    reads as tappable. */}
                {item.unread ? <View style={{ width: 9, height: 9, borderRadius: 999, backgroundColor: T.cardinal }} /> : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Delete conversation about ${item.listing_title}`}
                  disabled={busyId === item.id}
                  hitSlop={8}
                  onPress={(event) => {
                    event.stopPropagation();
                    setDeletingThread(item);
                  }}
                  style={{ padding: 6, opacity: busyId === item.id ? 0.45 : 1 }}
                >
                  {busyId === item.id ? (
                    <ActivityIndicator size="small" color={T.muted} />
                  ) : (
                    <Ionicons name="trash-outline" size={19} color={T.danger} />
                  )}
                </Pressable>
                </Pressable>
              );
            }}
          />
        ) : tab === 'wanted' ? (
          <FlatList
            {...listProps}
            key={`wanted-${direction}`}
            data={direction === 'received' ? wantedReceived : wantedSent}
            keyExtractor={(item) => item.id}
            onEndReached={async () => {
              const cursor = wantedNext[direction]; const pageKey = `${direction}:${cursor}`;
              if (!cursor || wantedPaging.current.has(pageKey)) return;
              wantedPaging.current.add(pageKey);
              try {
                const result = await fetchWantedOffers(direction, cursor);
                setWantedNext((current) => {
                  if (current[direction] !== cursor) return current;
                  const append = (all: WantedOffer[]) => [...all, ...result.wanted_offers.filter((offer) => !all.some((item) => item.id === offer.id))];
                  if (direction === 'received') setWantedReceived(append); else setWantedSent(append);
                  return { ...current, [direction]: result.next_cursor };
                });
              } catch { setActionError('Could not load more Wanted offers. Tap to retry.'); }
              finally { wantedPaging.current.delete(pageKey); }
            }}
            renderItem={({ item }) => {
              const threadId = threads.find((row) => row.wanted_offer_id === item.id)?.id ?? null;
              const mutate = async (action: () => Promise<void>, fallback: string) => {
                setBusyId(item.id); setActionError(null);
                try { await action(); await load(); refreshBadge(); }
                catch (cause) { setActionError(cause instanceof Error ? cause.message : fallback); }
                finally { setBusyId(null); }
              };
              return <WantedOfferRow
                offer={item} threadId={threadId} busy={busyId === item.id}
                onAccept={async () => { setBusyId(item.id); try { const nextThread = await acceptWantedOffer(item.id); await load(); refreshBadge(); router.push(`/messages/${nextThread}`); } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Could not accept offer.'); } finally { setBusyId(null); } }}
                onDecline={() => mutate(() => resolveWantedOffer(item.id, 'decline').then(() => undefined), 'Could not decline offer.')}
                onEdit={() => router.push(`/wanted/${item.wanted_post_id}/offer?offerId=${item.id}`)}
                onWithdraw={() => mutate(() => resolveWantedOffer(item.id, 'withdraw').then(() => undefined), 'Could not withdraw offer.')}
                onChat={() => threadId ? router.push(`/messages/${threadId}`) : setActionError('Conversation is still opening. Pull down to refresh.')}
                onComplete={() => mutate(() => completeWantedOffer(item.id), 'Could not complete transaction.')}
                onRate={() => { setScore(0); setReviewText(''); setWantedRating(item); }}
                onReport={() => setWantedReporting(item)}
              />;
            }}
          />
        ) : (
          <FlatList
            {...listProps}
            key={tab}
            data={rows}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Row
                item={item}
                onPress={() => router.push(`/listing/${item.listing_id}`)}
                onRespond={
                  direction === 'received'
                    ? (action) => (action === 'approve' ? onApprove(item.id) : setDeclining(item))
                    : undefined
                }
                onReview={direction === 'received' ? () => openReview(item) : undefined}
                onComplete={() => onComplete(item)}
                onRate={() => openRate(item)}
                onOpenChat={(threadId) => router.push(`/messages/${threadId}`)}
                busy={busyId === item.id}
              />
            )}
          />
        )}
      </SafeAreaView>

      {actionError ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Retry refreshing requests" onPress={() => { setActionError(null); void load(); }} style={{ marginHorizontal: S.gutter, marginBottom: 10 }}>
          <View style={{ backgroundColor: '#F3E4E4', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 }}>
            <Text style={{ fontFamily: F.medium, fontSize: 13.5, color: T.danger }}>{actionError}</Text>
          </View>
        </Pressable>
      ) : null}

      {/* Completing archives nothing but does unlock ratings both ways, so it
          still deserves a confirm — just an in-app one. */}
      <Sheet visible={rangeOpen} onClose={() => setRangeOpen(false)} contentStyle={{ paddingHorizontal: 20 }}>
        <SheetGrabber />
        <View>
          <Text style={{ fontFamily: F.extrabold, fontSize: 18, color: T.ink, letterSpacing: -0.3, marginBottom: 12 }}>
            Show requests from
          </Text>
          {RANGES.map((r) => {
            const active = range === r.id;
            return (
              <Pressable
                key={r.id}
                onPress={() => {
                  setRange(r.id);
                  setRangeOpen(false);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 15,
                  borderTopWidth: r.id === RANGES[0].id ? 0 : 1,
                  borderTopColor: T.rule,
                }}
              >
                <Text style={{ fontFamily: active ? F.bold : F.medium, fontSize: 15.5, color: active ? T.ink : T.muted }}>
                  {r.label}
                </Text>
                {active ? <Ionicons name="checkmark" size={19} color={T.cardinal} /> : null}
              </Pressable>
            );
          })}
        </View>
      </Sheet>

      <Sheet visible={!!completing} onClose={() => setCompleting(null)}>
        <SheetGrabber />
        <View>
          <Text style={{ fontFamily: F.extrabold, fontSize: 19, color: T.ink, letterSpacing: -0.3 }}>
            Mark this deal complete?
          </Text>
          <Text style={{ fontFamily: F.regular, fontSize: 14, color: T.muted, marginTop: 6, lineHeight: 20 }}>
            You&apos;ll both be able to leave a rating.
          </Text>
          <Pressable
            onPress={confirmComplete}
            style={{ marginTop: 20, backgroundColor: T.cardinal, borderRadius: 14, paddingVertical: 15, alignItems: 'center' }}
          >
            <Text style={{ fontFamily: F.bold, fontSize: 15.5, color: '#fff' }}>Mark complete</Text>
          </Pressable>
          <Pressable onPress={() => setCompleting(null)} style={{ marginTop: 14, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.medium, color: T.muted, fontSize: 14.5 }}>Cancel</Text>
          </Pressable>
        </View>
      </Sheet>

      <Sheet visible={!!deletingThread} onClose={() => setDeletingThread(null)}>
        <SheetGrabber />
        <View>
          <Text style={{ fontFamily: F.extrabold, fontSize: 19, color: T.ink, letterSpacing: -0.3 }}>
            Delete this conversation?
          </Text>
          <Text style={{ fontFamily: F.regular, fontSize: 14, color: T.muted, marginTop: 6, lineHeight: 20 }}>
            This permanently removes the chat and its messages for both people.
          </Text>
          <Pressable
            onPress={confirmDeleteThread}
            style={{ marginTop: 20, backgroundColor: T.danger, borderRadius: 14, paddingVertical: 15, alignItems: 'center' }}
          >
            <Text style={{ fontFamily: F.bold, fontSize: 15.5, color: '#fff' }}>Delete conversation</Text>
          </Pressable>
          <Pressable onPress={() => setDeletingThread(null)} style={{ marginTop: 14, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.medium, color: T.muted, fontSize: 14.5 }}>Cancel</Text>
          </Pressable>
        </View>
      </Sheet>

      {/* AI review of whoever sent an incoming request. Read-only: the
          Approve/Decline buttons stay on the row itself. */}
      <Sheet visible={!!reviewing} onClose={() => setReviewing(null)}>
        <SheetGrabber />
        <View>
          <Text style={{ fontFamily: F.extrabold, fontSize: 19, color: T.ink, letterSpacing: -0.3 }}>
            {reviewing?.counterpart?.display_name || 'This Trojan'}
          </Text>
          <Text style={{ fontFamily: F.regular, fontSize: 14, color: T.muted, marginTop: 6, lineHeight: 20 }}>
            {[reviewing?.counterpart?.school_unit, reviewing?.counterpart?.class_year]
              .filter(Boolean)
              .join(' · ') || 'No school or year on their profile'}
          </Text>

          <View style={{ marginTop: 16 }}>
            <SafetyCard review={review} loading={reviewLoading} />
          </View>

          {reviewing?.intro_message ? (
            <View style={{ marginTop: 14 }}>
              <Text style={{ fontFamily: F.bold, fontSize: 12, color: T.muted, letterSpacing: 0.5, marginBottom: 6 }}>
                THEIR MESSAGE
              </Text>
              <Text style={{ fontFamily: F.regular, fontSize: 14.5, color: T.ink, lineHeight: 21 }}>
                {reviewing.intro_message}
              </Text>
            </View>
          ) : null}

          <Pressable onPress={() => setReviewing(null)} style={{ marginTop: 20, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.medium, color: T.muted, fontSize: 14.5 }}>Close</Text>
          </Pressable>
        </View>
      </Sheet>

      {/* Decline sheet — a reason is optional, so declining stays one tap. */}
      <Sheet visible={!!declining} onClose={() => setDeclining(null)}>
        <SheetGrabber />
        <View>
          <View>
            <Text style={{ fontFamily: F.extrabold, fontSize: 19, color: T.ink, letterSpacing: -0.3 }}>
              Decline {declining?.counterpart?.display_name?.split(' ')[0] || 'this request'}?
            </Text>
            <Text style={{ fontFamily: F.regular, fontSize: 14, color: T.muted, marginTop: 6, lineHeight: 20 }}>
              This also permanently deletes the associated conversation. Adding a reason is optional.
            </Text>
            {DECLINE_REASONS.map((r) => (
              <Pressable
                key={r.id}
                onPress={async () => {
                  const target = declining;
                  setDeclining(null);
                  if (target) await respond(target.id, 'decline', r.id);
                }}
                style={{
                  marginTop: 10,
                  borderWidth: 1,
                  borderColor: T.rule,
                  borderRadius: 12,
                  paddingVertical: 13,
                  paddingHorizontal: 15,
                }}
              >
                <Text style={{ fontFamily: F.bold, fontSize: 15, color: T.ink }}>{r.label}</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={async () => {
                const target = declining;
                setDeclining(null);
                if (target) await respond(target.id, 'decline');
              }}
              style={{ marginTop: 14, alignItems: 'center' }}
            >
              <Text style={{ fontFamily: F.medium, color: T.muted, fontSize: 14.5 }}>Decline without a reason</Text>
            </Pressable>
            <Pressable onPress={() => setDeclining(null)} style={{ marginTop: 12, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.medium, color: T.ink, fontSize: 14.5 }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Sheet>

      {/* Rating sheet */}
      <Sheet visible={!!rateFor} onClose={() => setRateFor(null)}>
        <SheetGrabber />
        <View>
          <View>
            <Text style={{ fontFamily: F.extrabold, fontSize: 20, color: T.ink, letterSpacing: -0.4 }}>
              Rate {rateFor?.counterpart?.display_name || 'this Trojan'}
            </Text>
            <Text style={{ fontFamily: F.regular, fontSize: 14, color: T.muted, marginTop: 6 }}>
              How was the deal? Ratings are anonymous.
            </Text>

            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginVertical: 22 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} onPress={() => setScore(n)} hitSlop={6}>
                  <Ionicons name={n <= score ? 'star' : 'star-outline'} size={38} color={n <= score ? T.gold : T.rule} />
                </Pressable>
              ))}
            </View>

            <TextInput
              value={reviewText}
              onChangeText={setReviewText}
              placeholder="Add a note (optional)"
              placeholderTextColor={T.muted}
              multiline
              maxLength={500}
              style={{
                backgroundColor: T.fieldbg,
                borderRadius: 14,
                paddingHorizontal: 16,
                paddingVertical: 14,
                minHeight: 76,
                textAlignVertical: 'top',
                fontFamily: F.medium,
                fontSize: 15,
                color: T.ink,
              }}
            />

            <Pressable
              onPress={sendRating}
              disabled={savingRating || score < 1}
              style={{
                backgroundColor: T.cardinal,
                borderRadius: 14,
                paddingVertical: 16,
                alignItems: 'center',
                marginTop: 18,
                opacity: savingRating || score < 1 ? 0.5 : 1,
              }}
            >
              <Text style={{ fontFamily: F.bold, color: '#fff', fontSize: 16 }}>
                {savingRating ? 'Submitting…' : 'Submit rating'}
              </Text>
            </Pressable>
            <Pressable onPress={() => setRateFor(null)} style={{ marginTop: 14, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.medium, color: T.muted, fontSize: 14.5 }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Sheet>
      <Sheet visible={!!wantedRating} onClose={() => setWantedRating(null)}>
        <SheetGrabber />
        <Text style={{ fontFamily: F.extrabold, fontSize: 20, color: T.ink }}>Rate this Wanted transaction</Text>
        <Text style={{ fontFamily: F.regular, fontSize: 14, color: T.muted, marginTop: 6 }}>Ratings are anonymous.</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginVertical: 22 }}>
          {[1, 2, 3, 4, 5].map((n) => <Pressable accessibilityRole="button" accessibilityLabel={`${n} stars`} key={n} onPress={() => setScore(n)}><Ionicons name={n <= score ? 'star' : 'star-outline'} size={38} color={n <= score ? T.gold : T.rule} /></Pressable>)}
        </View>
        <TextInput accessibilityLabel="Rating note, optional" value={reviewText} onChangeText={setReviewText} placeholder="Add a note (optional)" placeholderTextColor={T.muted} multiline maxLength={500} style={{ backgroundColor: T.fieldbg, borderRadius: 14, padding: 14, minHeight: 76, fontFamily: F.medium, color: T.ink }} />
        <Pressable accessibilityRole="button" disabled={savingRating || score < 1} onPress={async () => { if (!wantedRating || score < 1) return; setSavingRating(true); try { await rateWantedOffer(wantedRating.id, score, reviewText); setWantedRating(null); await load(); refreshBadge(); } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Could not submit rating.'); } finally { setSavingRating(false); } }} style={{ backgroundColor: T.cardinal, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 18, opacity: savingRating || score < 1 ? .5 : 1 }}><Text style={{ fontFamily: F.bold, color: '#fff' }}>{savingRating ? 'Submitting…' : 'Submit rating'}</Text></Pressable>
      </Sheet>
      <Sheet visible={!!wantedReporting} onClose={() => setWantedReporting(null)}>
        <SheetGrabber />
        <ReportForm title="Report private offer" submitting={wantedReportBusy} onCancel={() => setWantedReporting(null)} onSubmit={async (reason, note) => { if (!wantedReporting) return; setWantedReportBusy(true); try { await reportWantedTarget({ wantedOfferId: wantedReporting.id }, reason, note); setWantedReporting(null); } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Could not submit report.'); } finally { setWantedReportBusy(false); } }} />
      </Sheet>
    </>
  );
}
