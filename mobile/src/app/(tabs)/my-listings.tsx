import { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, Pressable, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { goBack } from '@/lib/nav';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { fetchMyListings, MyListing } from '@/lib/listings';
import { ListingCard } from '@/components/ListingCard';
import { T, F, S } from '@/lib/theme';

type Tab = 'active' | 'past';

const TABS: { id: Tab; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'past', label: 'Past' },
];

// Everything the signed-in user has posted, split by whether it is still up.
// The profile tab shows only a short preview grid; this is where "See all"
// lands. Reviews live on their own screen, also reached from the profile.
export default function MyListings() {
  const router = useRouter();
  const { user } = useSession();
  const [listings, setListings] = useState<MyListing[]>([]);
  const [tab, setTab] = useState<Tab>('active');
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setListings(await fetchMyListings(user.id));
      setState('ready');
    } catch {
      setState('error');
    }
  }, [user]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const active = useMemo(() => listings.filter((l) => !l.archived), [listings]);
  const past = useMemo(() => listings.filter((l) => l.archived), [listings]);
  const counts: Record<Tab, number> = { active: active.length, past: past.length };

  if (state === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.bg }}>
        <ActivityIndicator color={T.cardinal} />
      </View>
    );
  }

  const emptyCopy =
    state === 'error'
      ? 'Couldn’t load your listings.'
      : tab === 'active'
        ? 'Nothing up right now. Post something to get started.'
        : 'Nothing sold yet. Listings you mark sold land here.';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 16,
          paddingTop: S.screenTop,
          paddingBottom: 10,
        }}
      >
        <Pressable onPress={() => goBack('/(tabs)/profile')} hitSlop={10}>
          <Ionicons name="chevron-back" size={23} color={T.ink} />
        </Pressable>
        <Text style={{ fontFamily: F.black, fontSize: 22, color: T.ink, letterSpacing: -0.6 }}>My Listings</Text>
      </View>

      {/* Counts are always shown so an empty tab reads as empty rather than
          as a failed load. */}
      <View style={{ flexDirection: 'row', gap: 7, paddingHorizontal: 16, paddingBottom: 12 }}>
        {TABS.map((t) => {
          const on = tab === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => setTab(t.id)}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 14,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: on ? T.ink : T.rule,
                backgroundColor: on ? T.ink : '#fff',
              }}
            >
              <Text style={{ fontFamily: F.semibold, fontSize: 13, color: on ? '#fff' : T.ink }}>
                {t.label} {counts[t.id]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        // Remount on tab change so the grid scrolls back to the top and
        // numColumns doesn't reuse the other tab's row layout.
        key={tab}
        data={tab === 'active' ? active : past}
        keyExtractor={(l) => l.id}
        numColumns={2}
        style={{ backgroundColor: T.bg }}
        contentContainerStyle={{
          // 10 + the card's own 6pt margin = 16pt, matching the header row above.
          paddingHorizontal: 10,
          paddingBottom: S.screenBottom,
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={{ padding: 40, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.medium, color: T.muted, textAlign: 'center', lineHeight: 21 }}>
              {emptyCopy}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <ListingCard listing={item} onPress={() => router.push(`/(tabs)/listing/${item.id}?from=my-listings`)} />
        )}
      />
    </SafeAreaView>
  );
}
