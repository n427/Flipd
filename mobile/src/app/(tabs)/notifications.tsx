import { useCallback, useMemo, useState } from 'react';
import { View, Text, SectionList, Pressable, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { Href, useRouter, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { fetchFeed, FeedListing, priceLabel } from '@/lib/listings';
import {
  fetchWantedNotifications,
  updateWantedNotifications,
  wantedNotificationDestination,
  WantedNotificationEvent,
} from '@/lib/wanted';
import { useUnread } from '@/lib/unread';
import { groupByDay } from '@/lib/day';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ListRowsSkeleton } from '@/components/Skeletons';
import { T, F, S } from '@/lib/theme';

type ActivityRow =
  | { kind: 'listing'; id: string; createdAt: string; listing: FeedListing }
  | { kind: 'wanted'; id: string; createdAt: string; event: WantedNotificationEvent };

export default function Notifications() {
  const router = useRouter();
  const { markEventsSeen, refresh } = useUnread();
  const [items, setItems] = useState<ActivityRow[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [feedResult, wantedResult] = await Promise.allSettled([
      fetchFeed({ sort: 'recent', limit: 30 }),
      fetchWantedNotifications(),
    ]);
    const rows: ActivityRow[] = [];
    if (feedResult.status === 'fulfilled') {
      rows.push(...feedResult.value.listings.map((listing) => ({
        kind: 'listing' as const, id: `listing-${listing.id}`, createdAt: listing.created_at, listing,
      })));
    }
    if (wantedResult.status === 'fulfilled') {
      rows.push(...wantedResult.value.map((event) => ({
        kind: 'wanted' as const, id: `wanted-${event.id}`, createdAt: event.created_at, event,
      })));
      const unread = wantedResult.value.filter((event) => !event.read_at).map((event) => event.id);
      if (unread.length > 0) void updateWantedNotifications(unread, 'read').then(refresh).catch(() => {});
    }
    rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setItems(rows);
    setState(feedResult.status === 'rejected' && wantedResult.status === 'rejected' ? 'error' : 'ready');
  }, [refresh]);

  useFocusEffect(useCallback(() => {
    void load();
    markEventsSeen();
    refresh();
  }, [load, markEventsSeen, refresh]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    refresh();
    setRefreshing(false);
  }, [load, refresh]);

  const dismiss = useCallback(async (event: WantedNotificationEvent) => {
    setItems((current) => current.filter((item) => item.id !== `wanted-${event.id}`));
    try {
      await updateWantedNotifications([event.id], 'dismiss');
      refresh();
    } catch {
      await load();
    }
  }, [load, refresh]);

  const sections = useMemo(() => groupByDay(items, (item) => item.createdAt), [items]);

  if (state === 'loading') {
    return <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}><ListRowsSkeleton /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: S.gutter, paddingTop: S.screenTop, paddingBottom: S.screenBottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.cardinal} />}
        ListHeaderComponent={<Text style={{ fontFamily: F.black, fontSize: 26, color: T.ink, letterSpacing: -0.7, marginBottom: 14 }}>Activity</Text>}
        renderSectionHeader={({ section }) => (
          <Text style={{ fontFamily: F.bold, fontSize: 11.5, letterSpacing: 0.9, color: T.muted, textTransform: 'uppercase', marginTop: section.title === sections[0]?.title ? 4 : 26, marginBottom: 6 }}>
            {section.title}
          </Text>
        )}
        ListEmptyComponent={(
          <View style={{ padding: 40, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.medium, color: T.muted, textAlign: 'center' }}>
              {state === 'error' ? 'Couldn’t load activity. Pull to retry.' : 'No new activity yet.'}
            </Text>
          </View>
        )}
        renderItem={({ item }) => {
          if (item.kind === 'wanted') {
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.event.title}. ${item.event.body}`}
                onPress={() => router.push(wantedNotificationDestination(item.event) as Href)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 11 }}
              >
                <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: T.fieldbg, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="search" size={21} color={T.cardinal} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 15.5, color: T.ink }}>{item.event.title}</Text>
                  <Text numberOfLines={2} style={{ fontFamily: F.regular, fontSize: 13.5, lineHeight: 18, color: T.muted, marginTop: 3 }}>{item.event.body}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Dismiss ${item.event.title}`}
                  hitSlop={10}
                  onPress={(pressEvent) => { pressEvent.stopPropagation(); void dismiss(item.event); }}
                >
                  <Feather name="x" size={18} color={T.muted} />
                </Pressable>
              </Pressable>
            );
          }
          const photo = item.listing.photo_urls[0];
          const who = item.listing.seller?.display_name?.split(' ')[0] || 'A Trojan';
          return (
            <Pressable onPress={() => router.push(`/listing/${item.listing.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 11 }}>
              <View style={{ width: 64, height: 64, borderRadius: 14, overflow: 'hidden', backgroundColor: T.fieldbg }}>
                {photo ? <Image source={{ uri: photo }} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 15.5, color: T.ink }}>{item.listing.title}</Text>
                <Text style={{ fontFamily: F.regular, fontSize: 13.5, color: T.muted, marginTop: 3 }}>{who} · {priceLabel(item.listing.price)}</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}
