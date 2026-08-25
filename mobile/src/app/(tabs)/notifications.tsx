import { useCallback, useMemo, useRef, useState } from 'react';
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
import { isCurrentNotificationLoad, mergeNotificationSources, NotificationSourceState } from '@/lib/notificationActivity';

type ActivityRow =
  | { kind: 'listing'; id: string; createdAt: string; listing: FeedListing }
  | { kind: 'wanted'; id: string; createdAt: string; event: WantedNotificationEvent };

export default function Notifications() {
  const router = useRouter();
  const { markEventsSeen, refresh } = useUnread();
  const [sources, setSources] = useState<NotificationSourceState<FeedListing, WantedNotificationEvent>>({
    listings: [], wanted: [], listingError: false, wantedError: false,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loadGeneration = useRef(0);

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    const current = () => isCurrentNotificationLoad(generation, loadGeneration.current);
    const feedLoad = fetchFeed({ sort: 'recent', limit: 30 }).then(
      ({ listings }) => {
        if (!current()) return;
        setSources((previous) => mergeNotificationSources(previous, { listings: { ok: true, items: listings } }));
        setLoading(false);
      },
      () => {
        if (!current()) return;
        setSources((previous) => mergeNotificationSources(previous, { listings: { ok: false } }));
        setLoading(false);
      },
    );
    const wantedLoad = fetchWantedNotifications().then(
      (events) => {
        if (!current()) return;
        setSources((previous) => mergeNotificationSources(previous, { wanted: { ok: true, items: events } }));
        setLoading(false);
        const unread = events.filter((event) => !event.read_at).map((event) => event.id);
        if (unread.length > 0) void updateWantedNotifications(unread, 'read').then(refresh).catch(() => {});
      },
      () => {
        if (!current()) return;
        setSources((previous) => mergeNotificationSources(previous, { wanted: { ok: false } }));
        setLoading(false);
      },
    );
    await Promise.all([feedLoad, wantedLoad]);
    return generation;
  }, [refresh]);

  useFocusEffect(useCallback(() => {
    void load();
    markEventsSeen();
    refresh();
  }, [load, markEventsSeen, refresh]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const generation = await load();
    if (isCurrentNotificationLoad(generation, loadGeneration.current)) {
      refresh();
      setRefreshing(false);
    }
  }, [load, refresh]);

  const dismiss = useCallback(async (event: WantedNotificationEvent) => {
    // A response that started before this mutation may still contain the row.
    // Invalidate it so it cannot resurrect a successfully dismissed event.
    loadGeneration.current += 1;
    setRefreshing(false);
    setSources((current) => ({ ...current, wanted: current.wanted.filter((item) => item.id !== event.id) }));
    try {
      await updateWantedNotifications([event.id], 'dismiss');
      refresh();
    } catch {
      await load();
    }
  }, [load, refresh]);

  const items = useMemo<ActivityRow[]>(() => [
    ...sources.listings.map((listing) => ({ kind: 'listing' as const, id: `listing-${listing.id}`, createdAt: listing.created_at, listing })),
    ...sources.wanted.map((event) => ({ kind: 'wanted' as const, id: `wanted-${event.id}`, createdAt: event.created_at, event })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [sources.listings, sources.wanted]);
  const sections = useMemo(() => groupByDay(items, (item) => item.createdAt), [items]);
  const hasError = sources.listingError || sources.wantedError;

  if (loading) {
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
        ListHeaderComponent={(
          <View>
            <Text style={{ fontFamily: F.black, fontSize: 26, color: T.ink, letterSpacing: -0.7, marginBottom: 14 }}>Activity</Text>
            {hasError ? (
              <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, backgroundColor: T.fieldbg, padding: 12, marginBottom: 12 }}>
                <Text style={{ flex: 1, fontFamily: F.medium, fontSize: 13.5, color: T.muted }}>
                  Some activity couldn’t refresh. Available items are still shown.
                </Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Retry activity" onPress={() => void load()} hitSlop={8}>
                  <Text style={{ fontFamily: F.bold, fontSize: 13.5, color: T.cardinal }}>Retry</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        )}
        renderSectionHeader={({ section }) => (
          <Text style={{ fontFamily: F.bold, fontSize: 11.5, letterSpacing: 0.9, color: T.muted, textTransform: 'uppercase', marginTop: section.title === sections[0]?.title ? 4 : 26, marginBottom: 6 }}>
            {section.title}
          </Text>
        )}
        ListEmptyComponent={(
          <View style={{ padding: 40, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.medium, color: T.muted, textAlign: 'center' }}>
              {hasError ? 'Couldn’t load activity. Pull to retry.' : 'No new activity yet.'}
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
