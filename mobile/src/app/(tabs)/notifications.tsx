import { useCallback, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, Pressable, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { fetchFeed, FeedListing, priceLabel } from '@/lib/listings';
import { useUnread } from '@/lib/unread';
import { SafeAreaView } from 'react-native-safe-area-context';
import { T, F, S } from '@/lib/theme';

// Event feed: recent campus activity (new listings). Distinct from the chat
// tab (reveal requests). Opening it clears the bell dot.
export default function Notifications() {
  const router = useRouter();
  const { markEventsSeen, refresh } = useUnread();
  const [items, setItems] = useState<FeedListing[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { listings } = await fetchFeed({ sort: 'recent', limit: 30 });
      setItems(listings);
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      // Seeing the feed clears the dot; refresh the provider so the tab updates.
      markEventsSeen();
      refresh();
    }, [load, markEventsSeen, refresh]),
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
      <FlatList
        data={items}
        keyExtractor={(l) => l.id}
        contentContainerStyle={{ paddingHorizontal: S.gutter, paddingTop: S.screenTop, paddingBottom: S.screenBottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.cardinal} />}
        ListHeaderComponent={
          <Text style={{ fontFamily: F.black, fontSize: 26, color: T.ink, letterSpacing: -0.7, marginBottom: 14 }}>
            Activity
          </Text>
        }
        ListEmptyComponent={
          <View style={{ padding: 40, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.medium, color: T.muted, textAlign: 'center' }}>
              {state === 'error' ? 'Couldn’t load activity. Pull to retry.' : 'No new activity yet.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const photo = item.photo_urls[0];
          return (
            <Pressable
              onPress={() => router.push(`/(tabs)/listing/${item.id}`)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 10,
              }}
            >
              <View style={{ width: 52, height: 52, borderRadius: 10, overflow: 'hidden', backgroundColor: T.rule }}>
                {photo ? <Image source={{ uri: photo }} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 15, color: T.ink }}>
                  {item.seller?.display_name?.split(' ')[0] || 'A Trojan'} posted {item.title}
                </Text>
                <Text style={{ fontFamily: F.medium, fontSize: 13, color: T.muted, marginTop: 2 }}>
                  {priceLabel(item.price)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={T.muted} />
            </Pressable>
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: T.rule }} />}
      />
    </SafeAreaView>
  );
}
