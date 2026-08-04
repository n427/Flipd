import { useCallback, useEffect, useState } from 'react';
import { View, Text, SectionList, ScrollView, Pressable, ActivityIndicator, RefreshControl, Alert, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sheet, SheetGrabber } from '@/components/Sheet';
import { SafetyCard } from '@/components/SafetyCard';
import { useSession } from '@/lib/session';
import { fetchSafetyReview, SafetyReview, fetchRequests, respondReveal, markRevealsSeen, submitRating, RevealRequest } from '@/lib/listings';
import { fetchThreads, ThreadSummary } from '@/lib/messages';
import { useUnread } from '@/lib/unread';
import { T, F, S } from '@/lib/theme';

// Status → label + colors (badge).
// Rows shown per section before "See all".
const PREVIEW_COUNT = 2;

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
  const canRespond = !!onRespond && item.status === 'pending';
  // Either party can close out an approved deal.
  const canComplete = !!onComplete && item.status === 'approved';
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: T.rule,
        marginBottom: 10,
        overflow: 'hidden',
      }}
    >
      <Pressable
        onPress={onPress}
        style={{
          paddingVertical: 14,
          paddingHorizontal: 16,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 15, color: T.ink }}>
            {item.listing_title || 'A listing'}
          </Text>
          {item.counterpart?.display_name ? (
            <Text numberOfLines={1} style={{ fontFamily: F.medium, fontSize: 13, color: T.muted, marginTop: 2 }}>
              {item.counterpart.display_name}
              {item.offer != null ? `  ·  Offer $${item.offer}` : ''}
            </Text>
          ) : item.offer != null ? (
            <Text style={{ fontFamily: F.medium, fontSize: 13, color: T.muted, marginTop: 2 }}>
              Offer: ${item.offer}
            </Text>
          ) : null}
        </View>
        <Badge status={item.status} />
      </Pressable>

      {/* The buyer's own words: the basis for the seller's decision, and for
          services the only way to know what is actually being asked for. */}
      {item.intro_message ? (
        <View style={{ borderTopWidth: 1, borderTopColor: T.rule, paddingHorizontal: 16, paddingVertical: 12 }}>
          <Text style={{ fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: '#333' }}>
            {item.intro_message}
          </Text>
        </View>
      ) : null}

      {item.thread_id ? (
        <Pressable
          onPress={() => onOpenChat?.(item.thread_id!)}
          style={{
            borderTopWidth: 1,
            borderTopColor: T.rule,
            paddingHorizontal: 16,
            paddingVertical: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Ionicons name="chatbubble-outline" size={16} color={T.cardinal} />
          <Text style={{ flex: 1, fontFamily: F.bold, fontSize: 14.5, color: T.cardinal }}>Open chat</Text>
          <Ionicons name="chevron-forward" size={16} color={T.muted} />
        </Pressable>
      ) : null}

      {canRespond && onReview ? (
        <Pressable
          onPress={onReview}
          style={{
            borderTopWidth: 1,
            borderTopColor: T.rule,
            paddingVertical: 12,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <Ionicons name="sparkles-outline" size={14} color={T.cardinal} />
          <Text style={{ fontFamily: F.bold, fontSize: 13.5, color: T.cardinal }}>Review profile</Text>
        </Pressable>
      ) : null}

      {canRespond ? (
        <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: T.rule }}>
          <Pressable
            onPress={() => onRespond!('decline')}
            disabled={busy}
            style={{ flex: 1, paddingVertical: 13, alignItems: 'center', opacity: busy ? 0.5 : 1 }}
          >
            <Text style={{ fontFamily: F.bold, fontSize: 14, color: T.muted }}>Decline</Text>
          </Pressable>
          <View style={{ width: 1, backgroundColor: T.rule }} />
          <Pressable
            onPress={() => onRespond!('approve')}
            disabled={busy}
            style={{ flex: 1, paddingVertical: 13, alignItems: 'center', opacity: busy ? 0.5 : 1 }}
          >
            {busy ? (
              <ActivityIndicator size="small" color={T.cardinal} />
            ) : (
              <Text style={{ fontFamily: F.bold, fontSize: 14, color: T.cardinal }}>Approve</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {canComplete ? (
        <Pressable
          onPress={onComplete}
          disabled={busy}
          style={{ borderTopWidth: 1, borderTopColor: T.rule, paddingVertical: 13, alignItems: 'center', opacity: busy ? 0.5 : 1 }}
        >
          {busy ? (
            <ActivityIndicator size="small" color={T.cardinal} />
          ) : (
            <Text style={{ fontFamily: F.bold, fontSize: 14, color: T.cardinal }}>Mark complete</Text>
          )}
        </Pressable>
      ) : null}

      {item.can_rate && onRate ? (
        <Pressable
          onPress={onRate}
          disabled={busy}
          style={{
            borderTopWidth: 1,
            borderTopColor: T.rule,
            paddingVertical: 13,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            opacity: busy ? 0.5 : 1,
          }}
        >
          <Ionicons name="star" size={15} color={T.gold} />
          <Text style={{ fontFamily: F.bold, fontSize: 14, color: T.ink }}>Leave a rating</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function Requests() {
  const router = useRouter();
  const { user } = useSession();
  const { refresh: refreshBadge } = useUnread();
  const [incoming, setIncoming] = useState<RevealRequest[]>([]);
  const [outgoing, setOutgoing] = useState<RevealRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Each section previews PREVIEW_COUNT rows until "See all" is tapped. Keyed
  // by section title so the two expand independently.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Confirmation sheet for completing a deal, and an inline error line —
  // both replace native Alerts, which felt out of place in the app.
  const [completing, setCompleting] = useState<RevealRequest | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Open conversations get their own section: a chat outlives the request that
  // created it, so burying it inside the originating row hides it once that
  // row scrolls away.
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
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
    try {
      setError(false);
      const [{ incoming, outgoing }, rows] = await Promise.all([
        fetchRequests(user.id),
        // Advisory: a failed thread fetch must not blank the request list.
        fetchThreads().catch(() => [] as ThreadSummary[]),
      ]);
      setIncoming(incoming);
      setOutgoing(outgoing);
      setThreads(rows);
    } catch (e) {
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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.bg }}>
        <ActivityIndicator color={T.cardinal} />
      </View>
    );
  }

  const sections = [
    { title: 'Chats', data: [] as RevealRequest[], incoming: false, chats: threads },
    { title: 'People who want to talk', data: incoming, incoming: true, chats: [] },
    { title: 'Requests you sent', data: outgoing, incoming: false, chats: [] },
  ]
    .filter((s) => s.data.length > 0 || s.chats.length > 0)
    .map((s) => ({
      ...s,
      total: s.chats.length || s.data.length,
      chats: expanded[s.title] ? s.chats : s.chats.slice(0, PREVIEW_COUNT),
      data: expanded[s.title] ? s.data : s.data.slice(0, PREVIEW_COUNT),
    }));

  if (!sections.length) {
    // Scrollable so pull-to-refresh actually works here — this used to be a
    // plain View that told people to "pull to retry" with nothing to pull.
    // A failed load also gets its own wording and a Retry button, rather than
    // being indistinguishable from having no requests at all.
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <Text style={{ fontFamily: F.bold, fontSize: 17, color: T.ink, marginBottom: 6 }}>
            {error ? 'Couldn’t load your requests' : 'No requests yet'}
          </Text>
          <Text style={{ fontFamily: F.regular, fontSize: 14, color: T.muted, textAlign: 'center' }}>
            {error
              ? 'Check your connection, then pull down to refresh.'
              : 'When you message a seller, or someone asks about your listing, it shows up here.'}
          </Text>
          {error ? (
            <Pressable
              onPress={onRefresh}
              style={{
                marginTop: 16,
                backgroundColor: T.cardinal,
                borderRadius: 12,
                paddingVertical: 12,
                paddingHorizontal: 24,
              }}
            >
              <Text style={{ fontFamily: F.bold, color: '#fff' }}>Retry</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <>
      <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
        <SectionList
          style={{ backgroundColor: T.bg }}
          contentContainerStyle={{
            paddingHorizontal: S.gutter,
            paddingTop: S.screenTop,
            paddingBottom: S.screenBottom,
          }}
          sections={sections}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderSectionFooter={({ section }) =>
            section.chats.length ? (
              <View style={{ gap: 10, marginBottom: 10 }}>
                {section.chats.map((t) => (
                  <Pressable
                    key={t.id}
                    onPress={() => router.push(`/(tabs)/messages/${t.id}`)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      backgroundColor: '#fff',
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: T.rule,
                      padding: 14,
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {t.unread ? (
                          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: T.cardinal }} />
                        ) : null}
                        <Text
                          numberOfLines={1}
                          style={{ flex: 1, fontFamily: t.unread ? F.extrabold : F.bold, fontSize: 15, color: T.ink }}
                        >
                          {t.counterpart?.display_name || 'Flipd member'}
                        </Text>
                      </View>
                      <Text numberOfLines={1} style={{ fontFamily: F.medium, fontSize: 12.5, color: T.muted, marginTop: 2 }}>
                        {t.listing_title || 'A listing'}
                      </Text>
                      <Text numberOfLines={1} style={{ fontFamily: F.regular, fontSize: 13.5, color: T.muted, marginTop: 4 }}>
                        {t.last_message || 'No messages yet'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={17} color={T.muted} />
                  </Pressable>
                ))}
              </View>
            ) : null
          }
          renderSectionHeader={({ section }) => (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 10,
                marginTop: 8,
              }}
            >
              <Text style={{ fontFamily: F.extrabold, fontSize: 15, color: T.ink }}>{section.title}</Text>
              {/* Only offer it when the preview is actually hiding something. */}
              {section.total > PREVIEW_COUNT ? (
                <Pressable
                  onPress={() => setExpanded((e) => ({ ...e, [section.title]: !e[section.title] }))}
                  hitSlop={8}
                >
                  <Text style={{ fontFamily: F.semibold, fontSize: 13.5, color: T.cardinal }}>
                    {expanded[section.title] ? 'Show less' : `See all ${section.total}`}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}
          renderItem={({ item, section }) => (
            <Row
              item={item}
              onPress={() => router.push(`/(tabs)/listing/${item.listing_id}?from=requests`)}
              onRespond={
                section.incoming
                  ? (action) => (action === 'approve' ? onApprove(item.id) : setDeclining(item))
                  : undefined
              }
              onReview={section.incoming ? () => openReview(item) : undefined}
              onComplete={() => onComplete(item)}
              onRate={() => openRate(item)}
              onOpenChat={(threadId) => router.push(`/(tabs)/messages/${threadId}`)}
              busy={busyId === item.id}
            />
          )}
        />
      </SafeAreaView>

      {actionError ? (
        <Pressable onPress={() => setActionError(null)} style={{ marginHorizontal: S.gutter, marginBottom: 10 }}>
          <View style={{ backgroundColor: '#F3E4E4', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 }}>
            <Text style={{ fontFamily: F.medium, fontSize: 13.5, color: T.danger }}>{actionError}</Text>
          </View>
        </Pressable>
      ) : null}

      {/* Completing archives nothing but does unlock ratings both ways, so it
          still deserves a confirm — just an in-app one. */}
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
              Adding a reason is optional, and it helps them know whether to try again.
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
    </>
  );
}
