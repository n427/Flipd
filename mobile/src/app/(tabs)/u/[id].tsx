import { useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { fetchPublicProfile, fetchUserListings, fetchRatings, FeedSeller, FeedListing, RatingSummary } from '@/lib/listings';
import { ListingCard } from '@/components/ListingCard';
import { T, F } from '@/lib/theme';

// Compact star row for an average score (supports halves).
function Stars({ value, size = 15 }: { value: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 1 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Ionicons
          key={n}
          name={value >= n ? 'star' : value >= n - 0.5 ? 'star-half' : 'star-outline'}
          size={size}
          color={T.gold}
        />
      ))}
    </View>
  );
}

export default function PublicProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<FeedSeller | null>(null);
  const [listings, setListings] = useState<FeedListing[]>([]);
  const [ratings, setRatings] = useState<RatingSummary>({ average: null, count: 0, reviews: [] });
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    (async () => {
      try {
        const [p, l, r] = await Promise.all([
          fetchPublicProfile(String(id)),
          fetchUserListings(String(id)),
          fetchRatings(String(id)),
        ]);
        setProfile(p);
        setListings(l);
        setRatings(r);
        setState('ready');
      } catch {
        setState('error');
      }
    })();
  }, [id]);

  if (state === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.bg }}>
        <ActivityIndicator color={T.cardinal} />
      </View>
    );
  }

  const unitYear = [profile?.school_unit, profile?.class_year].filter(Boolean).join(' · ');

  return (
    <FlatList
      data={listings}
      keyExtractor={(l) => l.id}
      numColumns={2}
      style={{ backgroundColor: T.bg }}
      contentContainerStyle={{ padding: 6, paddingTop: 60 }}
      ListHeaderComponent={
        <View style={{ padding: 10, alignItems: 'center', gap: 8, marginBottom: 8 }}>
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={{ width: 72, height: 72, borderRadius: 36 }} contentFit="cover" />
          ) : (
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: T.fieldbg }} />
          )}
          <Text style={{ fontFamily: F.extrabold, fontSize: 20, color: T.ink }}>
            {profile?.display_name ?? 'A Trojan'}
          </Text>
          {unitYear ? <Text style={{ fontFamily: F.regular, color: T.muted }}>{unitYear}</Text> : null}

          {ratings.average != null ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <Stars value={ratings.average} />
              <Text style={{ fontFamily: F.bold, fontSize: 13.5, color: T.ink }}>{ratings.average.toFixed(1)}</Text>
              <Text style={{ fontFamily: F.regular, fontSize: 13, color: T.muted }}>
                ({ratings.count} {ratings.count === 1 ? 'rating' : 'ratings'})
              </Text>
            </View>
          ) : ratings.count === 0 && state === 'ready' ? (
            <Text style={{ fontFamily: F.regular, fontSize: 13, color: T.muted }}>No ratings yet</Text>
          ) : null}

          {state === 'error' ? <Text style={{ color: T.danger }}>Couldn’t load this profile.</Text> : null}

          {ratings.reviews.some((r) => r.text) ? (
            <View style={{ alignSelf: 'stretch', marginTop: 16, gap: 10 }}>
              <Text style={{ fontFamily: F.bold, fontSize: 14, color: T.ink }}>Reviews</Text>
              {ratings.reviews
                .filter((r) => r.text)
                .slice(0, 5)
                .map((r, i) => (
                  <View key={i} style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: T.rule, borderRadius: 12, padding: 12, gap: 6 }}>
                    <Stars value={r.score} size={13} />
                    <Text style={{ fontFamily: F.regular, fontSize: 14, color: '#333', lineHeight: 20 }}>{r.text}</Text>
                  </View>
                ))}
            </View>
          ) : null}

          <Text style={{ fontFamily: F.bold, fontSize: 14, color: T.ink, alignSelf: 'flex-start', marginTop: 18 }}>
            Listings
          </Text>
        </View>
      }
      ListEmptyComponent={
        state === 'ready' ? (
          <View style={{ padding: 24, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.medium, color: T.muted }}>No active listings.</Text>
          </View>
        ) : null
      }
      renderItem={({ item }) => (
        <ListingCard listing={item} onPress={() => router.push(`/(tabs)/listing/${item.id}`)} />
      )}
    />
  );
}
