import { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { CardGridSkeleton } from '@/components/SkeletonCard';
import { useSession } from '@/lib/session';
import { fetchMyListings, MyListing } from '@/lib/listings';
import { ListingCard } from '@/components/ListingCard';
import { T, F, S } from '@/lib/theme';
import { fetchWantedFeed, WantedPost } from '@/lib/wanted';
import { WantedCard } from '@/components/WantedCard';
import { wantedHistoryBucket } from '@/lib/myMarketplace';

type Tab = 'active' | 'past';
type Kind = 'selling' | 'wanted';

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
  const [wanted, setWanted] = useState<WantedPost[]>([]);
  const [kind, setKind] = useState<Kind>('selling');
  const [tab, setTab] = useState<Tab>('active');
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [saleRows, wantedRows] = await Promise.all([
        fetchMyListings(user.id),
        fetchWantedFeed({ mine: true, limit: 100 }),
      ]);
      setListings(saleRows);
      setWanted(wantedRows.wanted_posts);
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
  const activeWanted = useMemo(() => wanted.filter((post) => wantedHistoryBucket(post) === 'active'), [wanted]);
  const pastWanted = useMemo(() => wanted.filter((post) => wantedHistoryBucket(post) === 'past'), [wanted]);
  const visible: (MyListing | WantedPost)[] = kind === 'selling'
    ? (tab === 'active' ? active : past)
    : (tab === 'active' ? activeWanted : pastWanted);
  const visibleCounts: Record<Tab, number> = kind === 'selling'
    ? counts
    : { active: activeWanted.length, past: pastWanted.length };

  if (state === 'loading') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
        <ScreenHeader />
        <CardGridSkeleton titleWidth={148} pills={2} />
      </SafeAreaView>
    );
  }

  const emptyCopy =
    state === 'error'
      ? 'Couldn’t load your listings.'
      : kind === 'wanted'
        ? tab === 'active'
          ? 'No active requests. Post what you need from the Wanted tab.'
          : 'Completed and expired requests land here.'
      : tab === 'active'
        ? 'Nothing up right now. Post something to get started.'
        : 'Nothing sold yet. Listings you mark sold land here.';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
      <ScreenHeader />
      <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
        <Text style={{ fontFamily: F.black, fontSize: 22, color: T.ink, letterSpacing: -0.6 }}>My Listings</Text>
      </View>

      <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: T.rule }}>
        {(['selling', 'wanted'] as Kind[]).map((item) => {
          const on = kind === item;
          return <Pressable key={item} onPress={() => { setKind(item); setTab('active'); }} style={{ marginRight: 22, paddingBottom: 7, borderBottomWidth: 2, borderBottomColor: on ? T.cardinal : 'transparent' }}><Text style={{ fontFamily: on ? F.bold : F.medium, color: on ? T.ink : T.muted, fontSize: 15 }}>{item === 'selling' ? 'Selling' : 'Wanted'}</Text></Pressable>;
        })}
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
                {t.label} {visibleCounts[t.id]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList<MyListing | WantedPost>
        // Remount on tab change so the grid scrolls back to the top and
        // numColumns doesn't reuse the other tab's row layout.
        key={tab}
        data={visible}
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
        renderItem={({ item }) => kind === 'selling'
          ? <ListingCard listing={item as MyListing} onPress={() => router.push(`/listing/${item.id}`)} />
          : <WantedCard post={item as WantedPost} onPress={() => router.push(`/wanted/${item.id}`)} />}
      />
    </SafeAreaView>
  );
}
