import { useCallback, useEffect, useState } from 'react';
import { View, Text, SectionList, ScrollView, Pressable, ActivityIndicator, RefreshControl, Alert, Linking, Modal, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '@/lib/session';
import { fetchRequests, respondReveal, markRevealsSeen, submitRating, RevealRequest, SharedContact } from '@/lib/listings';
import { useUnread } from '@/lib/unread';
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

// The other party's shared contact, shown once approved. Each row deep-links
// to the right app (Instagram / dialer / mail) when tapped.
function ContactBlock({ contact }: { contact: SharedContact }) {
  const rows: { icon: keyof typeof Ionicons.glyphMap; value: string; href: string }[] = [];
  if (contact.instagram) {
    const handle = contact.instagram.replace(/^@/, '');
    rows.push({ icon: 'logo-instagram', value: `@${handle}`, href: `https://instagram.com/${handle}` });
  }
  if (contact.phone) rows.push({ icon: 'call-outline', value: contact.phone, href: `tel:${contact.phone}` });
  if (contact.email) rows.push({ icon: 'mail-outline', value: contact.email, href: `mailto:${contact.email}` });
  if (rows.length === 0) return null;
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: T.rule, paddingHorizontal: 16, paddingVertical: 12, gap: 10 }}>
      <Text style={{ fontFamily: F.bold, fontSize: 11, color: T.muted, letterSpacing: 0.6, textTransform: 'uppercase' }}>
        Contact
      </Text>
      {rows.map((r) => (
        <Pressable
          key={r.href}
          onPress={() => Linking.openURL(r.href)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
        >
          <Ionicons name={r.icon} size={17} color={T.cardinal} />
          <Text style={{ fontFamily: F.semibold, fontSize: 14.5, color: T.cardinal }}>{r.value}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Row({
  item,
  onPress,
  onRespond,
  onComplete,
  onRate,
  busy,
}: {
  item: RevealRequest;
  onPress: () => void;
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

      {item.contact ? <ContactBlock contact={item.contact} /> : null}

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

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setError(false);
      const { incoming, outgoing } = await fetchRequests(user.id);
      setIncoming(incoming);
      setOutgoing(outgoing);
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

  // Seller approves or declines an incoming reveal. Approving shares contact
  // both ways (the server emails both parties). Reload so the badge updates.
  const respond = useCallback(
    async (id: string, action: 'approve' | 'decline', markSold = false) => {
      setBusyId(id);
      try {
        await respondReveal(id, action, markSold);
        await load();
        refreshBadge();
        if (action === 'approve') {
          Alert.alert(
            markSold ? 'Approved & marked sold' : 'Approved',
            markSold
              ? 'You each got the other’s contact. The listing is now archived and other pending requests were declined.'
              : 'You each got the other’s contact. It’s shown on this request.',
          );
        }
      } catch (e) {
        Alert.alert('Could not update', e instanceof Error ? e.message : 'Try again.');
      } finally {
        setBusyId(null);
      }
    },
    [load, refreshBadge],
  );

  // Approve taps ask whether this closes the sale, since that also archives the
  // listing and declines everyone else waiting on it.
  const onApprove = useCallback(
    (id: string) => {
      Alert.alert('Approve this request?', 'Share contact info with this buyer.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve only', onPress: () => respond(id, 'approve', false) },
        { text: 'Approve & mark sold', style: 'destructive', onPress: () => respond(id, 'approve', true) },
      ]);
    },
    [respond],
  );

  // Close out an approved deal. Once completed, both parties can rate.
  const onComplete = useCallback(
    (id: string) => {
      Alert.alert('Mark this deal complete?', 'You’ll both be able to leave a rating.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark complete',
          onPress: async () => {
            setBusyId(id);
            try {
              await respondReveal(id, 'complete');
              await load();
              refreshBadge();
            } catch (e) {
              Alert.alert('Could not update', e instanceof Error ? e.message : 'Try again.');
            } finally {
              setBusyId(null);
            }
          },
        },
      ]);
    },
    [load, refreshBadge],
  );

  // --- Rating sheet ---
  const [rateFor, setRateFor] = useState<RevealRequest | null>(null);
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
    { title: 'People who want your contact', data: incoming, incoming: true },
    { title: 'Requests you sent', data: outgoing, incoming: false },
  ].filter((s) => s.data.length > 0);

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
              : 'When you reveal contact on a listing, or someone requests yours, it shows up here.'}
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
          renderSectionHeader={({ section }) => (
            <Text style={{ fontFamily: F.extrabold, fontSize: 15, color: T.ink, marginBottom: 10, marginTop: 8 }}>
              {section.title}
            </Text>
          )}
          renderItem={({ item, section }) => (
            <Row
              item={item}
              onPress={() => router.push(`/(tabs)/listing/${item.listing_id}?from=requests`)}
              onRespond={
                section.incoming
                  ? (action) => (action === 'approve' ? onApprove(item.id) : respond(item.id, 'decline'))
                  : undefined
              }
              onComplete={() => onComplete(item.id)}
              onRate={() => openRate(item)}
              busy={busyId === item.id}
            />
          )}
        />
      </SafeAreaView>

      {/* Rating sheet */}
      <Modal visible={!!rateFor} animationType="slide" transparent onRequestClose={() => setRateFor(null)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 22, paddingBottom: 36 }}>
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
      </Modal>
    </>
  );
}
