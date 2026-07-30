import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Linking, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSession } from '@/lib/session';
import { fetchListing, deleteListing, setListingArchived, ListingDetail, priceLabel } from '@/lib/listings';
import { T, F } from '@/lib/theme';
import { PhotoCarousel } from '@/components/PhotoCarousel';

const MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useSession();
  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'notfound'>('loading');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const l = await fetchListing(String(id));
      if (!l) {
        setState('notfound');
        return;
      }
      setListing(l);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const isOwner = !!user && !!listing && user.id === listing.seller_id;

  const onToggleSold = async () => {
    if (!listing) return;
    setBusy(true);
    try {
      await setListingArchived(listing.id, !listing.archived);
      await load();
    } catch (e) {
      Alert.alert('Could not update', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = () => {
    if (!listing) return;
    Alert.alert('Delete listing?', 'This permanently removes it and its photos.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await deleteListing(listing.id);
            router.back();
          } catch (e) {
            setBusy(false);
            Alert.alert('Could not delete', e instanceof Error ? e.message : 'Try again.');
          }
        },
      },
    ]);
  };

  if (state === 'loading') return <View style={c.center}><ActivityIndicator color={T.cardinal} /></View>;
  if (state === 'error') return <View style={c.center}><Text style={{ fontFamily: F.medium, color: T.muted }}>Couldn&apos;t load this listing.</Text></View>;
  if (state === 'notfound' || !listing) return <View style={c.center}><Text style={{ fontFamily: F.medium, color: T.muted }}>Listing not found.</Text></View>;

  const hasCoords = listing.lat != null && listing.lng != null;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${listing.lat},${listing.lng}`;
  const sellerLine = [listing.seller?.display_name, listing.seller?.school_unit, listing.seller?.class_year]
    .filter(Boolean)
    .join(' · ');

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }} style={{ backgroundColor: T.bg }}>
      <PhotoCarousel photos={listing.photo_urls} />

      <View style={{ padding: 20 }}>
        {/* Title + price */}
        <Text style={{ fontFamily: F.extrabold, fontSize: 24, color: T.ink, letterSpacing: -0.6, lineHeight: 29 }}>
          {listing.title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <Text style={{ fontFamily: F.black, fontSize: 22, color: listing.price > 0 ? T.ink : T.cardinal }}>
            {priceLabel(listing.price)}
          </Text>
          {listing.negotiable ? (
            <View style={{ backgroundColor: T.fieldbg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ fontFamily: F.semibold, fontSize: 12, color: T.muted }}>Open to offers</Text>
            </View>
          ) : null}
        </View>

        {/* Description */}
        {listing.description ? (
          <>
            <Text style={sectionLabel}>Details</Text>
            <Text style={{ fontFamily: F.regular, fontSize: 15, color: '#333', lineHeight: 23 }}>
              {listing.description}
            </Text>
          </>
        ) : null}

        {/* Location */}
        <Text style={sectionLabel}>Where you’ll meet</Text>
        <Text style={{ fontFamily: F.medium, fontSize: 15, color: T.ink }}>
          {listing.place_name || listing.location || 'USC · pickup'}
        </Text>
        {hasCoords && MAPS_KEY ? (
          <>
            <Pressable
              onPress={() => Linking.openURL(mapsUrl)}
              style={{ borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: T.rule, marginTop: 12 }}
            >
              <Image
                source={{
                  uri: `https://maps.googleapis.com/maps/api/staticmap?center=${listing.lat},${listing.lng}&zoom=16&size=600x240&scale=2&markers=color:red%7C${listing.lat},${listing.lng}&key=${MAPS_KEY}`,
                }}
                style={{ width: '100%', height: 160 }}
                contentFit="cover"
              />
            </Pressable>
            <Pressable onPress={() => Linking.openURL(mapsUrl)} style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="navigate-outline" size={15} color={T.cardinal} />
              <Text style={{ fontFamily: F.semibold, color: T.cardinal }}>Open in Google Maps</Text>
            </Pressable>
          </>
        ) : null}

        {/* Seller */}
        {listing.seller ? (
          <>
            <Text style={sectionLabel}>Seller</Text>
            <Pressable
              onPress={() => router.push(`/(tabs)/u/${listing.seller_id}`)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                backgroundColor: '#fff',
                borderWidth: 1,
                borderColor: T.rule,
                borderRadius: 14,
                padding: 12,
              }}
            >
              {listing.seller.avatar_url ? (
                <Image source={{ uri: listing.seller.avatar_url }} style={{ width: 44, height: 44, borderRadius: 22 }} contentFit="cover" />
              ) : (
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: T.fieldbg, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="person" size={20} color={T.muted} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.bold, fontSize: 15, color: T.ink }}>
                  {listing.seller.display_name || 'A Trojan'}
                </Text>
                <Text style={{ fontFamily: F.regular, fontSize: 13, color: T.muted, marginTop: 1 }}>
                  {[listing.seller.school_unit, listing.seller.class_year].filter(Boolean).join(' · ') || 'USC'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={T.muted} />
            </Pressable>
          </>
        ) : null}

        {isOwner ? (
          <View style={{ marginTop: 24, gap: 10 }}>
            {listing.archived ? (
              <View style={{ backgroundColor: T.fieldbg, borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ fontFamily: F.bold, color: T.muted, fontSize: 13 }}>
                  Sold — hidden from the feed
                </Text>
              </View>
            ) : null}
            <Pressable
              onPress={() => router.push(`/(tabs)/listing/${listing.id}/edit`)}
              disabled={busy}
              style={{ backgroundColor: T.cardinal, borderRadius: 14, paddingVertical: 16, alignItems: 'center', opacity: busy ? 0.6 : 1 }}
            >
              <Text style={{ fontFamily: F.bold, color: '#fff', fontSize: 16 }}>Edit listing</Text>
            </Pressable>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={onToggleSold}
                disabled={busy}
                style={{ flex: 1, backgroundColor: T.fieldbg, borderRadius: 14, paddingVertical: 15, alignItems: 'center', opacity: busy ? 0.6 : 1 }}
              >
                <Text style={{ fontFamily: F.bold, color: T.ink, fontSize: 15 }}>
                  {listing.archived ? 'Relist' : 'Mark sold'}
                </Text>
              </Pressable>
              <Pressable
                onPress={onDelete}
                disabled={busy}
                style={{ flex: 1, borderRadius: 14, borderWidth: 1, borderColor: T.danger, paddingVertical: 15, alignItems: 'center', opacity: busy ? 0.6 : 1 }}
              >
                <Text style={{ fontFamily: F.bold, color: T.danger, fontSize: 15 }}>Delete</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <>
            {/* Reveal — display only for now */}
            <Pressable
              disabled
              style={{ backgroundColor: T.rule, borderRadius: 14, paddingVertical: 17, alignItems: 'center', marginTop: 24 }}
            >
              <Text style={{ fontFamily: F.bold, color: '#fff', fontSize: 16 }}>Reveal Contact</Text>
            </Pressable>
            <Text style={{ fontFamily: F.regular, color: T.muted, fontSize: 12.5, textAlign: 'center', marginTop: 8 }}>
              Requesting contact from the app is coming soon.
            </Text>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const c = {
  center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 24, backgroundColor: T.bg },
  muted: { color: '#666' },
};
const sectionLabel = {
  fontFamily: F.bold,
  fontSize: 12,
  color: T.muted,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.6,
  marginTop: 24,
  marginBottom: 8,
} as const;
