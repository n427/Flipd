import { useCallback, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, Pressable, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSession } from '@/lib/session';
import { fetchSavedListings, FeedListing } from '@/lib/listings';
import { ListingCard } from '@/components/ListingCard';
import { T, F } from '@/lib/theme';

export default function Saved() {
  const router = useRouter();
  const { user } = useSession();
  const [listings, setListings] = useState<FeedListing[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setListings(await fetchSavedListings(user.id));
      setState('ready');
    } catch {
      setState('error');
    }
  }, [user]);

  // Reload on focus so un-saving from a detail view updates the list.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (state === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.bg }}>
        <ActivityIndicator color={T.cardinal} />
      </View>
    );
  }

  if (state === 'error' && listings.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.bg, padding: 24, gap: 14 }}>
        <Text style={{ fontFamily: F.medium, color: T.muted }}>Couldn’t load your saved items.</Text>
        <Pressable onPress={() => { setState('loading'); load(); }} style={{ backgroundColor: T.cardinal, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 }}>
          <Text style={{ fontFamily: F.bold, color: '#fff' }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      data={listings}
      keyExtractor={(l) => l.id}
      numColumns={2}
      style={{ backgroundColor: T.bg }}
      contentContainerStyle={{ padding: 6, paddingTop: 56 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={
        <Text style={{ fontFamily: F.black, fontSize: 24, color: T.ink, letterSpacing: -0.6, paddingHorizontal: 6, paddingBottom: 10 }}>
          Saved
        </Text>
      }
      ListEmptyComponent={
        <View style={{ padding: 40, alignItems: 'center' }}>
          <Text style={{ fontFamily: F.medium, color: T.muted, textAlign: 'center' }}>
            Nothing saved yet. Tap the heart on a listing to keep it here.
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <ListingCard listing={item} onPress={() => router.push(`/(tabs)/listing/${item.id}`)} />
      )}
    />
  );
}
