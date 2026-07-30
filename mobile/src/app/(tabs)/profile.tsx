import { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { fetchMyProfile, fetchMyListings, MyProfile, FeedListing } from '@/lib/listings';
import { ListingCard } from '@/components/ListingCard';
import { T, F } from '@/lib/theme';

export default function Profile() {
  const router = useRouter();
  const { user } = useSession();
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [listings, setListings] = useState<FeedListing[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [p, l] = await Promise.all([fetchMyProfile(user.id), fetchMyListings(user.id)]);
        setProfile(p);
        setListings(l);
        setState('ready');
      } catch {
        setState('error');
      }
    })();
  }, [user]);

  if (state === 'loading') return <View style={c.center}><ActivityIndicator /></View>;

  const unitYear = [profile?.school_unit, profile?.class_year].filter(Boolean).join(' · ');

  return (
    <FlatList
      data={listings}
      keyExtractor={(l) => l.id}
      numColumns={2}
      contentContainerStyle={{ padding: 6 }}
      ListHeaderComponent={
        <View style={{ padding: 10, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={{ width: 56, height: 56, borderRadius: 28 }} contentFit="cover" />
            ) : (
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#eee' }} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.extrabold, fontSize: 18, color: T.ink }}>{profile?.display_name ?? user?.email ?? 'You'}</Text>
              {unitYear ? <Text style={{ fontFamily: F.regular, color: T.muted }}>{unitYear}</Text> : null}
            </View>
          </View>
          {profile?.bio ? <Text style={{ fontFamily: F.regular, fontSize: 14, color: '#333', marginTop: 2 }}>{profile.bio}</Text> : null}
          {state === 'error' ? <Text style={{ fontFamily: F.medium, color: T.danger }}>Couldn&apos;t load your profile.</Text> : null}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
            <Pressable
              onPress={() => router.push('/(tabs)/edit-profile')}
              style={{ backgroundColor: T.cardinal, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 }}
            >
              <Text style={{ fontFamily: F.bold, color: '#fff' }}>Edit profile</Text>
            </Pressable>
            <Pressable
              onPress={() => supabase.auth.signOut()}
              style={{ backgroundColor: T.fieldbg, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20 }}
            >
              <Text style={{ fontFamily: F.bold, color: T.ink }}>Sign out</Text>
            </Pressable>
          </View>
          <Text style={{ fontFamily: F.bold, fontSize: 15, marginTop: 16, color: T.ink }}>My Listings</Text>
        </View>
      }
      ListEmptyComponent={
        state === 'ready' ? (
          <View style={{ padding: 24 }}>
            <Text style={{ fontFamily: F.medium, color: T.muted }}>You haven&apos;t posted anything yet.</Text>
          </View>
        ) : null
      }
      renderItem={({ item }) => (
        <ListingCard listing={item} onPress={() => router.push(`/(tabs)/listing/${item.id}`)} />
      )}
    />
  );
}

const c = { center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const } };
