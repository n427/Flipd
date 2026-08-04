import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { fetchMyProfile, fetchMyListings, MyProfile, FeedListing } from '@/lib/listings';
import { unregisterPush } from '@/lib/push';
import { ListingCard } from '@/components/ListingCard';
import { T, F, S } from '@/lib/theme';

// Tappable row used for Saved and the About links below the listings grid.
function LinkRow({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: T.rule,
        borderRadius: 12,
        paddingVertical: 13,
        paddingHorizontal: 15,
      }}
    >
      <Ionicons name={icon} size={18} color={T.cardinal} />
      <Text style={{ flex: 1, fontFamily: F.bold, fontSize: 15, color: T.ink }}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={T.muted} />
    </Pressable>
  );
}

export default function Profile() {
  const router = useRouter();
  const { user } = useSession();
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [listings, setListings] = useState<FeedListing[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [p, l] = await Promise.all([fetchMyProfile(user.id), fetchMyListings(user.id)]);
      setProfile(p);
      setListings(l);
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

  const signOut = useCallback(async () => {
    setSigningOut(true);
    try {
      await unregisterPush();
      await supabase.auth.signOut();
    } catch {
      setSigningOut(false);
      Alert.alert('Could not sign out', 'Try again.');
    }
  }, []);

  // Reload on every focus so an edited profile or a posted/deleted listing
  // reflects on return. Only the first load shows the spinner (initial state).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (state === 'loading') return <View style={c.center}><ActivityIndicator color={T.cardinal} /></View>;

  // Full error screen with retry when we have nothing to show.
  if (state === 'error' && !profile) {
    return (
      <View style={[c.center, { padding: 24, gap: 14 }]}>
        <Text style={{ fontFamily: F.medium, color: T.muted, textAlign: 'center' }}>Couldn’t load your profile.</Text>
        <Pressable onPress={() => { setState('loading'); load(); }} style={{ backgroundColor: T.cardinal, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 }}>
          <Text style={{ fontFamily: F.bold, color: '#fff' }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const unitYear = [profile?.school_unit, profile?.class_year].filter(Boolean).join(' · ');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
      <FlatList
        data={listings.slice(0, PREVIEW_COUNT)}
        keyExtractor={(l) => l.id}
        numColumns={2}
        contentContainerStyle={{
          // 10 + each card's own 6pt margin = a 16pt edge, matching the
          // header's padding:10 inside this same container. With gridGutter (6)
          // the cards sat at 12pt and read as closer to the edge than the
          // header above them. Same math as the feed grid.
          paddingHorizontal: 10,
          paddingTop: S.screenTop,
          paddingBottom: S.screenBottom,
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View style={{ padding: 10, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 1, borderColor: T.rule }} contentFit="cover" />
              ) : (
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: T.fieldbg, borderWidth: 1, borderColor: T.rule }} />
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
                onPress={signOut}
                disabled={signingOut}
                style={{ backgroundColor: T.fieldbg, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20, opacity: signingOut ? 0.6 : 1 }}
              >
                <Text style={{ fontFamily: F.bold, color: T.ink }}>{signingOut ? 'Signing out…' : 'Sign out'}</Text>
              </Pressable>
            </View>

            <View style={{ marginTop: 14 }}>
              <LinkRow icon="heart" label="Saved" onPress={() => router.push('/(tabs)/saved')} />
            </View>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 18,
              }}
            >
              <Text style={{ fontFamily: F.bold, fontSize: 15, color: T.ink }}>My Listings</Text>
              {/* Only offer "See all" when the preview is actually hiding something. */}
              {listings.length > PREVIEW_COUNT ? (
                <Pressable onPress={() => router.push('/(tabs)/my-listings')} hitSlop={8}>
                  <Text style={{ fontFamily: F.semibold, fontSize: 13.5, color: T.cardinal }}>
                    See all {listings.length}
                  </Text>
                </Pressable>
              ) : null}
            </View>
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
          <ListingCard listing={item} onPress={() => router.push(`/(tabs)/listing/${item.id}?from=profile`)} />
        )}
        ListFooterComponent={
          <View style={{ padding: 10, paddingTop: 24, gap: 8 }}>
            <Text style={{ fontFamily: F.bold, fontSize: 15, color: T.ink, marginBottom: 2 }}>About</Text>
            <LinkRow icon="help-circle-outline" label="Support" onPress={() => router.push('/(tabs)/support')} />
            <LinkRow icon="document-text-outline" label="Terms of Service" onPress={() => router.push('/(tabs)/terms')} />
            <LinkRow icon="lock-closed-outline" label="Privacy Policy" onPress={() => router.push('/(tabs)/privacy')} />
            <Text style={{ fontFamily: F.regular, fontSize: 12, color: T.muted, textAlign: 'center', marginTop: 10 }}>
              © 2026 Flipd
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

// Listings shown on the profile before "See all" takes over.
const PREVIEW_COUNT = 4;

const c = { center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const } };
