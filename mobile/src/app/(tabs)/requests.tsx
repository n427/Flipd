import { useCallback, useEffect, useState } from 'react';
import { View, Text, SectionList, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession } from '@/lib/session';
import { fetchRequests, RevealRequest } from '@/lib/listings';
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

function Row({ item, onPress }: { item: RevealRequest; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: '#fff',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: T.rule,
        paddingVertical: 14,
        paddingHorizontal: 16,
        marginBottom: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 15, color: T.ink }}>
          {item.listing_title || 'A listing'}
        </Text>
        {item.offer != null ? (
          <Text style={{ fontFamily: F.medium, fontSize: 13, color: T.muted, marginTop: 2 }}>
            Offer: ${item.offer}
          </Text>
        ) : null}
      </View>
      <Badge status={item.status} />
    </Pressable>
  );
}

export default function Requests() {
  const router = useRouter();
  const { user } = useSession();
  const [incoming, setIncoming] = useState<RevealRequest[]>([]);
  const [outgoing, setOutgoing] = useState<RevealRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

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
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.bg }}>
        <ActivityIndicator color={T.cardinal} />
      </View>
    );
  }

  const sections = [
    { title: 'People who want your contact', data: incoming },
    { title: 'Requests you sent', data: outgoing },
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
      renderItem={({ item }) => (
        <Row item={item} onPress={() => router.push(`/(tabs)/listing/${item.listing_id}`)} />
      )}
    />
  );
}
