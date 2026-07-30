import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Linking, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { fetchListing, ListingDetail, priceLabel } from '@/lib/listings';
import { T, F } from '@/lib/theme';
import { PhotoCarousel } from '@/components/PhotoCarousel';

const MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'notfound'>('loading');

  useEffect(() => {
    (async () => {
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
    })();
  }, [id]);

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
            <View
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
              <Ionicons name="shield-checkmark" size={18} color={T.cardinal} />
            </View>
          </>
        ) : null}

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
