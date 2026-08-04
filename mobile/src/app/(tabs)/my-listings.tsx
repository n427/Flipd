import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { goBack } from '@/lib/nav';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { fetchMyListings, FeedListing } from '@/lib/listings';
import { ListingCard } from '@/components/ListingCard';
import { SkeletonCard } from '@/components/SkeletonCard';
import { T, F, S } from '@/lib/theme';

// Full list of the signed-in user's listings. The profile tab shows only a
// short preview grid; this is where "See all" lands.
export default function MyListings() {
  const router = useRouter();
  const { user } = useSession();
  const [listings, setListings] = useState<FeedListing[]>([]);
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

  if (state === 'loading') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, paddingTop: S.screenTop }}>
          {Array.from({ length: 4 }).map((_, i) => (
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
        <Pressable
          onPress={() => goBack('/(tabs)/profile')}
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={23} color={T.ink} />
        </Pressable>
        <Text style={{ fontFamily: F.black, fontSize: 22, color: T.ink, letterSpacing: -0.6 }}>My Listings</Text>
      </View>

      <FlatList
        data={listings}
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
            <Text style={{ fontFamily: F.medium, color: T.muted, textAlign: 'center' }}>
              {state === 'error' ? 'Couldn’t load your listings.' : 'You haven’t posted anything yet.'}
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
