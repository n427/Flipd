import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Linking, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { fetchListing, ListingDetail, priceLabel } from '@/lib/listings';
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

  if (state === 'loading') return <View style={c.center}><ActivityIndicator /></View>;
  if (state === 'error') return <View style={c.center}><Text style={c.muted}>Couldn&apos;t load this listing.</Text></View>;
  if (state === 'notfound' || !listing) return <View style={c.center}><Text style={c.muted}>Listing not found.</Text></View>;

  const hasCoords = listing.lat != null && listing.lng != null;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${listing.lat},${listing.lng}`;
  const sellerLine = [listing.seller?.display_name, listing.seller?.school_unit, listing.seller?.class_year]
    .filter(Boolean)
    .join(' · ');

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
      <PhotoCarousel photos={listing.photo_urls} />

      <View style={{ padding: 16, gap: 8 }}>
        <Text style={{ fontSize: 22, fontWeight: '800' }}>{listing.title}</Text>
        <Text style={{ fontSize: 18, fontWeight: '700', color: listing.price > 0 ? '#111' : '#990000' }}>
          {priceLabel(listing.price)}
          {listing.negotiable ? '  ·  Negotiable' : ''}
        </Text>
        {listing.description ? (
          <Text style={{ fontSize: 15, color: '#333', lineHeight: 22 }}>{listing.description}</Text>
        ) : null}

        {/* Location */}
        {hasCoords && MAPS_KEY ? (
          <View style={{ marginTop: 8, gap: 8 }}>
            <Text style={{ color: '#666' }}>
              Pickup at {listing.place_name || listing.location || 'the pinned spot'}
            </Text>
            <Pressable
              onPress={() => Linking.openURL(mapsUrl)}
              style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#eee' }}
            >
              <Image
                source={{
                  uri: `https://maps.googleapis.com/maps/api/staticmap?center=${listing.lat},${listing.lng}&zoom=16&size=600x240&scale=2&markers=color:red%7C${listing.lat},${listing.lng}&key=${MAPS_KEY}`,
                }}
                style={{ width: '100%', height: 160 }}
                contentFit="cover"
              />
            </Pressable>
            <Pressable onPress={() => Linking.openURL(mapsUrl)}>
              <Text style={{ color: '#111', fontWeight: '600' }}>Open in Google Maps</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={{ color: '#666', marginTop: 8 }}>
            Pickup at {listing.place_name || listing.location || 'USC · pickup'}
          </Text>
        )}

        {/* Seller */}
        {listing.seller ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
            {listing.seller.avatar_url ? (
              <Image
                source={{ uri: listing.seller.avatar_url }}
                style={{ width: 36, height: 36, borderRadius: 18 }}
                contentFit="cover"
              />
            ) : (
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#eee' }} />
            )}
            <Text style={{ fontWeight: '600' }}>{sellerLine || 'A Trojan'}</Text>
          </View>
        ) : null}

        {/* Reveal — display only for now */}
        <View style={{ marginTop: 20, gap: 6 }}>
          <Pressable disabled style={{ backgroundColor: '#ccc', borderRadius: 10, padding: 16, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Reveal Contact</Text>
          </Pressable>
          <Text style={{ color: '#999', fontSize: 12, textAlign: 'center' }}>
            Requesting contact from the app is coming soon.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const c = {
  center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 24 },
  muted: { color: '#666' },
};
