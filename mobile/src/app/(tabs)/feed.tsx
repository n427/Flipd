import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, FlatList, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { fetchFeed, fetchBlockedIds, FeedListing, FeedSort } from '@/lib/listings';
import { ListingCard } from '@/components/ListingCard';
import { CATEGORIES } from '@/lib/catalog';
import { T, F } from '@/lib/theme';

const CATS = [{ id: 'all', label: 'All' }, ...CATEGORIES];
const SORTS: { id: FeedSort; label: string }[] = [
  { id: 'recent', label: 'Recent' },
  { id: 'price_low', label: 'Price ↑' },
  { id: 'price_high', label: 'Price ↓' },
];

export default function Feed() {
  const router = useRouter();
  const [listings, setListings] = useState<FeedListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(false);
  const [cat, setCat] = useState('all');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState(''); // search term actually sent
  const [sort, setSort] = useState<FeedSort>('recent');

  // Blocked ids rarely change — fetch once and reuse across queries.
  const blockedRef = useRef<string[] | null>(null);
  const getBlocked = useCallback(async () => {
    if (blockedRef.current === null) blockedRef.current = await fetchBlockedIds();
    return blockedRef.current;
  }, []);

  // Debounce the search box so we don't query on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Load page 0 for the current filters. Any filter change re-runs this.
  const load = useCallback(async () => {
    try {
      setError(false);
      const blockedIds = await getBlocked();
      const { listings: rows, hasMore: more } = await fetchFeed({
        query: debounced,
        category: cat,
        sort,
        blockedIds,
        offset: 0,
      });
      setListings(rows);
      setHasMore(more);
    } catch {
      setError(true);
    }
  }, [debounced, cat, sort, getBlocked]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  // Refresh on focus so posts/deletes elsewhere show up (blocked list too).
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      blockedRef.current = null; // re-check blocks on return
      load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    blockedRef.current = null;
    await load();
    setRefreshing(false);
  }, [load]);

  // Append the next page when the user scrolls to the end.
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const blockedIds = await getBlocked();
      const { listings: more, hasMore: still } = await fetchFeed({
        query: debounced,
        category: cat,
        sort,
        blockedIds,
        offset: listings.length,
      });
      setListings((prev) => [...prev, ...more]);
      setHasMore(still);
    } catch {
      // keep what we have; a pull-to-refresh recovers
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, debounced, cat, sort, listings.length, getBlocked]);

  const header = (
    <View style={{ paddingHorizontal: 12 }}>
      <Text style={{ fontFamily: F.black, fontSize: 26, color: T.ink, letterSpacing: -1, marginBottom: 12 }}>
        flipd<Text style={{ color: T.cardinal }}>.</Text>
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: T.fieldbg,
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: 11,
        }}
      >
        <Ionicons name="search" size={17} color={T.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search Flipd"
          placeholderTextColor={T.muted}
          autoCapitalize="none"
          returnKeyType="search"
          style={{ flex: 1, fontFamily: F.medium, fontSize: 15, color: T.ink, padding: 0 }}
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={17} color={T.muted} />
          </Pressable>
        ) : null}
      </View>

      {/* Category chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 14, paddingBottom: 6 }}>
        {CATS.map((c) => {
          const active = cat === c.id;
          return (
            <Pressable
              key={c.id}
              onPress={() => setCat(c.id)}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 16,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: active ? T.ink : T.rule,
                backgroundColor: active ? T.ink : '#fff',
              }}
            >
              <Text style={{ fontFamily: F.semibold, fontSize: 13.5, color: active ? '#fff' : T.ink }}>{c.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Sort row */}
      <View style={{ flexDirection: 'row', gap: 8, paddingBottom: 12, paddingTop: 4 }}>
        {SORTS.map((s) => {
          const active = sort === s.id;
          return (
            <Pressable
              key={s.id}
              onPress={() => setSort(s.id)}
              style={{
                paddingVertical: 6,
                paddingHorizontal: 12,
                borderRadius: 8,
                backgroundColor: active ? T.fieldbg : 'transparent',
              }}
            >
              <Text style={{ fontFamily: active ? F.bold : F.medium, fontSize: 13, color: active ? T.ink : T.muted }}>
                {s.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.bg }}>
        <ActivityIndicator color={T.cardinal} />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
      <FlatList
        data={listings}
        keyExtractor={(l) => l.id}
        numColumns={2}
        style={{ backgroundColor: T.bg }}
        contentContainerStyle={{ paddingHorizontal: 6, paddingBottom: 16 }}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          loadingMore ? <ActivityIndicator color={T.cardinal} style={{ marginVertical: 20 }} /> : null
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', justifyContent: 'center', padding: 48 }}>
            <Text style={{ fontFamily: F.medium, color: T.muted }}>
              {error ? 'Couldn’t load — pull to retry.' : debounced || cat !== 'all' ? 'Nothing matches that.' : 'No listings yet.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <ListingCard listing={item} onPress={() => router.push(`/(tabs)/listing/${item.id}`)} />
        )}
      />
    </SafeAreaView>
  );
}
