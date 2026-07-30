import { useCallback, useEffect, useState } from 'react';
import { View, Text, SectionList, Pressable, ActivityIndicator, RefreshControl, Alert, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSession } from '@/lib/session';
import { fetchRequests, respondReveal, markRevealsSeen, RevealRequest, SharedContact } from '@/lib/listings';
import { useUnread } from '@/lib/unread';
import { T, F } from '@/lib/theme';

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
  busy,
}: {
  item: RevealRequest;
  onPress: () => void;
  // Present only on incoming rows the current user can act on.
  onRespond?: (action: 'approve' | 'decline') => void;
  busy?: boolean;
}) {
  const canRespond = !!onRespond && item.status === 'pending';
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
    } catch {
      setError(true);
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
              : 'You each got the other’s contact — it’s shown on this request.',
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
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.bg, padding: 32 }}>
        <Text style={{ fontFamily: F.bold, fontSize: 17, color: T.ink, marginBottom: 6 }}>No requests yet</Text>
        <Text style={{ fontFamily: F.regular, fontSize: 14, color: T.muted, textAlign: 'center' }}>
          {error
            ? 'Couldn’t load your requests — pull to retry.'
            : 'When you reveal contact on a listing, or someone requests yours, it shows up here.'}
        </Text>
      </View>
    );
  }

  return (
    <SectionList
      style={{ backgroundColor: T.bg }}
      contentContainerStyle={{ padding: 16 }}
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
          onPress={() => router.push(`/(tabs)/listing/${item.listing_id}`)}
          onRespond={
            section.incoming
              ? (action) => (action === 'approve' ? onApprove(item.id) : respond(item.id, 'decline'))
              : undefined
          }
          busy={busyId === item.id}
        />
      )}
    />
  );
}
