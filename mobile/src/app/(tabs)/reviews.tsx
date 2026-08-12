import { useCallback, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, Pressable, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '@/lib/session';
import { fetchRatings, RatingSummary } from '@/lib/listings';
import { Stars } from '@/components/Stars';
import { goBackTo } from '@/lib/nav';
import { T, F, S } from '@/lib/theme';

// Ratings this user has received. Anonymous by design — the API never returns
// who left them, so there is no author to show.
export default function Reviews() {
  const { user } = useSession();
  const [ratings, setRatings] = useState<RatingSummary>({ average: null, count: 0, reviews: [] });
  const [state, setState] = useState<'loading' | 'ready'>('loading');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    // fetchRatings swallows its own errors and returns an empty summary, so
    // there is no error state to render here.
    setRatings(await fetchRatings(user.id));
    setState('ready');
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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.bg }}>
        <ActivityIndicator color={T.cardinal} />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
      <FlatList
        data={ratings.reviews}
        keyExtractor={(r, i) => `${r.created_at}-${i}`}
        style={{ backgroundColor: T.bg }}
        contentContainerStyle={{
          paddingHorizontal: S.gutter,
          paddingTop: S.screenTop,
          paddingBottom: S.screenBottom,
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View style={{ paddingBottom: 10 }}>
            <Pressable
              onPress={() => goBackTo('/(tabs)/profile')}
              hitSlop={10}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 }}
            >
              <Feather name="chevron-left" size={20} color={T.muted} />
              <Text style={{ fontFamily: F.medium, fontSize: 15, color: T.muted }}>Back</Text>
            </Pressable>
            <Text style={{ fontFamily: F.black, fontSize: 24, color: T.ink, letterSpacing: -0.6 }}>Reviews</Text>
            {ratings.average != null ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <Stars value={ratings.average} size={17} />
                <Text style={{ fontFamily: F.bold, fontSize: 15, color: T.ink }}>{ratings.average.toFixed(1)}</Text>
                <Text style={{ fontFamily: F.regular, fontSize: 13.5, color: T.muted }}>
                  from {ratings.count} {ratings.count === 1 ? 'sale' : 'sales'}
                </Text>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <View style={{ padding: 40, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.medium, color: T.muted, textAlign: 'center', lineHeight: 21 }}>
              No reviews yet. They arrive after a completed sale.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ paddingVertical: 14, borderTopWidth: 1, borderTopColor: T.rule }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Stars value={item.score} size={13} />
              <Text style={{ fontFamily: F.regular, fontSize: 12.5, color: T.muted }}>
                {new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </Text>
            </View>
            {item.text ? (
              <Text style={{ fontFamily: F.regular, fontSize: 14.5, color: T.ink, lineHeight: 21, marginTop: 6 }}>
                {item.text}
              </Text>
            ) : null}
          </View>
        )}
      />
    </SafeAreaView>
  );
}
