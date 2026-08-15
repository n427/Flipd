import { useCallback, useMemo, useState } from 'react';
import { View, Text, SectionList, Pressable, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
import { fetchFeed, FeedListing, priceLabel } from '@/lib/listings';
import { useUnread } from '@/lib/unread';
import { groupByDay } from '@/lib/day';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ListRowsSkeleton } from '@/components/Skeletons';
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

  // The query already returns newest first, so contiguous grouping keeps both
  // the sections and the rows inside them in order.
  const sections = useMemo(() => groupByDay(items, (l) => l.created_at), [items]);

  if (state === 'loading') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
        <ListRowsSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
      <SectionList
        sections={sections}
        keyExtractor={(l) => l.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: S.gutter, paddingTop: S.screenTop, paddingBottom: S.screenBottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.cardinal} />}
        ListHeaderComponent={
          <Text style={{ fontFamily: F.black, fontSize: 26, color: T.ink, letterSpacing: -0.7, marginBottom: 14 }}>
            Activity
          </Text>
        }
        renderSectionHeader={({ section }) => (
          <Text
            style={{
              fontFamily: F.bold,
              fontSize: 11.5,
              letterSpacing: 0.9,
              color: T.muted,
              textTransform: 'uppercase',
              // Generous lead-in above each day, tighter under it, so the
              // header reads as attached to the rows that follow.
              marginTop: section.title === sections[0]?.title ? 4 : 26,
              marginBottom: 6,
            }}
          >
            {section.title}
          </Text>
        )}
        ListEmptyComponent={
          <View style={{ padding: 40, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.medium, color: T.muted, textAlign: 'center' }}>
              {state === 'error' ? 'Couldn’t load activity. Pull to retry.' : 'No new activity yet.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const photo = item.photo_urls[0];
          const who = item.seller?.display_name?.split(' ')[0] || 'A Trojan';
          return (
            <Pressable
              onPress={() => router.push(`/listing/${item.id}`)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                paddingVertical: 11,
              }}
            >
              <View style={{ width: 64, height: 64, borderRadius: 14, overflow: 'hidden', backgroundColor: T.fieldbg }}>
                {photo ? <Image source={{ uri: photo }} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 15.5, color: T.ink }}>
                  {item.title}
                </Text>
                {/* Who and how much, quietly — the day header already carries when. */}
                <Text style={{ fontFamily: F.regular, fontSize: 13.5, color: T.muted, marginTop: 3 }}>
                  {who} · {priceLabel(item.price)}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}
