import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, FlatList, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { fetchFeed, FeedListing } from '@/lib/listings';
import { ListingCard } from '@/components/ListingCard';
import { CATEGORIES } from '@/lib/catalog';
import { T, F } from '@/lib/theme';

const CATS = [{ id: 'all', label: 'All' }, ...CATEGORIES];

export default function Feed() {
  const router = useRouter();
  const [listings, setListings] = useState<FeedListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [cat, setCat] = useState('all');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    try {
      setError(false);
      setListings(await fetchFeed());
    } catch {
      setError(true);
    }
  }, []);

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

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return listings.filter((l) => {
      if (cat !== 'all' && l.category !== cat) return false;
      if (q && !l.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [listings, cat, query]);

  const header = (
    <View style={{ paddingHorizontal: 12 }}>
      {/* Brand + search */}
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
          style={{ flex: 1, fontFamily: F.medium, fontSize: 15, color: T.ink, padding: 0 }}
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={17} color={T.muted} />
          </Pressable>
        ) : null}
      </View>

      {/* Category chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingVertical: 14 }}
      >
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
        data={visible}
        keyExtractor={(l) => l.id}
        numColumns={2}
        style={{ backgroundColor: T.bg }}
        contentContainerStyle={{ paddingHorizontal: 6, paddingBottom: 16 }}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', justifyContent: 'center', padding: 48 }}>
            <Text style={{ fontFamily: F.medium, color: T.muted }}>
              {error ? 'Couldn’t load — pull to retry.' : query || cat !== 'all' ? 'Nothing matches that.' : 'No listings yet.'}
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
