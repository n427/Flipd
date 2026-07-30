import { useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { fetchPublicProfile, fetchUserListings, FeedSeller, FeedListing } from '@/lib/listings';
import { ListingCard } from '@/components/ListingCard';
import { T, F } from '@/lib/theme';

export default function PublicProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<FeedSeller | null>(null);
  const [listings, setListings] = useState<FeedListing[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    (async () => {
      try {
        const [p, l] = await Promise.all([fetchPublicProfile(String(id)), fetchUserListings(String(id))]);
        setProfile(p);
        setListings(l);
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
          {state === 'error' ? <Text style={{ color: T.danger }}>Couldn’t load this profile.</Text> : null}
          <Text style={{ fontFamily: F.bold, fontSize: 14, color: T.ink, alignSelf: 'flex-start', marginTop: 14 }}>
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
