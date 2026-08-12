import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sheet, SheetGrabber } from '@/components/Sheet';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { fetchFeed, fetchBlockedIds, FeedListing, FeedSort, FeedRange } from '@/lib/listings';
import { captureSearch } from '@/lib/searchCapture';
import { ListingCard } from '@/components/ListingCard';
import { SkeletonCard } from '@/components/SkeletonCard';
import { CATEGORIES } from '@/lib/catalog';
import { T, F, S } from '@/lib/theme';

const CATS = [{ id: 'all', label: 'All' }, ...CATEGORIES];

// 'Recent' moved out of this row — it's a date FILTER now, not a sort, so it
// lives in the range dropdown. What's left are the two orderings, which apply
// within whatever window the range selects.
const SORTS: { id: FeedSort; label: string }[] = [
  { id: 'recent', label: 'Newest' },
  { id: 'price_low', label: 'Price ↑' },
  { id: 'price_high', label: 'Price ↓' },
];

const RANGES: { id: FeedRange; label: string; short: string }[] = [
  { id: 'day', label: 'Past 24 hours', short: 'Past day' },
  { id: 'week', label: 'Past week', short: 'Past week' },
  { id: 'month', label: 'Past month', short: 'Past month' },
  { id: 'all', label: 'All time', short: 'All time' },
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
  // Default to the past week: the feed is for what's currently for sale, and
  // an unbounded list surfaces stale listings first-time users can't act on.
  const [range, setRange] = useState<FeedRange>('week');
  const [rangeOpen, setRangeOpen] = useState(false);

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
        range,
        blockedIds,
        offset: 0,
      });
      setListings(rows);
      setHasMore(more);
    } catch {
      setError(true);
    }
  }, [debounced, cat, sort, range, getBlocked]);

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
        range,
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
  }, [loadingMore, hasMore, debounced, cat, sort, range, listings.length, getBlocked]);

  const header = (
    // Sits inside the grid's paddingHorizontal:10 container; add 6 so header
    // content lines up with the cards (10 + 6 = 16 outer edge, and each card
    // adds its own 6 margin to reach the same 16).
    <View style={{ paddingHorizontal: 6, paddingTop: S.screenTop }}>
      <Text style={{ fontFamily: F.black, fontSize: 28, color: T.ink, letterSpacing: -1, marginBottom: 16 }}>
        Flipd<Text style={{ color: T.cardinal }}>.</Text>
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
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <TextInput
            value={query}
            // captureSearch is debounced and fire-and-forget — it records the
            // query for the daily digest and never blocks or fails the search.
            onChangeText={(q) => { setQuery(q); captureSearch(q); }}
            autoCapitalize="none"
            returnKeyType="search"
            autoCorrect={false}
            style={{ fontFamily: F.medium, fontSize: 15, color: T.ink, padding: 0 }}
          />
          {/* Placeholder drawn as real Text: iOS renders the native
              `placeholder` with fallback font metrics when the input has a
              custom fontFamily, which shows up as wrong glyphs and wide
              letter-spacing. An overlay keeps it in Figtree. */}
          {!query ? (
            <Text
              pointerEvents="none"
              style={{
                position: 'absolute',
                fontFamily: F.medium,
                fontSize: 15,
                color: T.muted,
              }}
            >
              Search Flipd
            </Text>
          ) : null}
        </View>
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={17} color={T.muted} />
          </Pressable>
        ) : null}
      </View>

      {/* Category chips — one scrolling row, swipe to reach the overflow. */}
      <View style={{ paddingTop: 16, paddingBottom: 4 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -6 }}
          contentContainerStyle={{ gap: 7, paddingLeft: 6, paddingRight: 6 }}
        >
          {CATS.map((c) => {
            const active = cat === c.id;
            return (
              <Pressable
                key={c.id}
                onPress={() => setCat(c.id)}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? T.ink : T.rule,
                  backgroundColor: active ? T.ink : '#fff',
                }}
              >
                <Text style={{ fontFamily: F.semibold, fontSize: 13, color: active ? '#fff' : T.ink }}>{c.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

      </View>

      {/* Range dropdown + sort row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 12, paddingBottom: 14 }}>
        <Pressable
          onPress={() => setRangeOpen(true)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: T.rule,
          }}
        >
          <Text style={{ fontFamily: F.bold, fontSize: 13, color: T.ink }}>
            {RANGES.find((r) => r.id === range)?.short}
          </Text>
          <Ionicons name="chevron-down" size={13} color={T.muted} />
        </Pressable>

        {/* Divider — the range filter and the sorts are different axes */}
        <View style={{ width: 1, height: 18, backgroundColor: T.rule, marginHorizontal: 2 }} />

        {SORTS.map((s) => {
          const active = sort === s.id;
          return (
            <Pressable
              key={s.id}
              onPress={() => setSort(s.id)}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 11,
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

  // Skeleton grid shown under the header while the first page loads, so the
  // page renders content-shaped immediately instead of a lone spinner.
  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
        <View style={{ paddingHorizontal: 10 }}>{header}</View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={{ width: '50%' }}>
              <SkeletonCard />
            </View>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
      <FlatList
        data={listings}
        keyExtractor={(l) => l.id}
        numColumns={2}
        style={{ backgroundColor: T.bg }}
        contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: S.screenBottom }}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.cardinal} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          loadingMore ? <ActivityIndicator color={T.cardinal} style={{ marginVertical: 20 }} /> : null
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', justifyContent: 'center', padding: 48 }}>
            <Text style={{ fontFamily: F.medium, color: T.muted }}>
              {error ? 'Couldn’t load. Pull to retry.' : debounced || cat !== 'all' ? 'Nothing matches that.' : 'No listings yet.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <ListingCard listing={item} onPress={() => router.push(`/listing/${item.id}`)} />
        )}
      />

      {/* Range picker. A custom sheet rather than a native picker so it matches
          the rest of the app on both platforms. */}
      <Sheet visible={rangeOpen} onClose={() => setRangeOpen(false)} contentStyle={{ paddingHorizontal: 20 }}>
        <SheetGrabber />
        <View>
          <Text style={{ fontFamily: F.extrabold, fontSize: 18, color: T.ink, letterSpacing: -0.3, marginBottom: 12 }}>
            Show listings from
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
    </SafeAreaView>
  );
}
