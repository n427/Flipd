import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { FeedListing, priceLabel } from '@/lib/listings';

export function ListingCard({ listing, onPress }: { listing: FeedListing; onPress: () => void }) {
  const [failed, setFailed] = useState(false);
  const photo = listing.photo_urls[0];
  const sellerLine =
    [
      listing.seller?.display_name?.split(' ')[0],
      listing.seller?.school_unit,
      listing.seller?.class_year,
    ]
      .filter(Boolean)
      .join(' · ') || (listing.location ?? 'USC · pickup');

  return (
    <Pressable onPress={onPress} style={{ flex: 1, margin: 6 }}>
      <View style={{ aspectRatio: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: '#f0efec' }}>
        {photo && !failed ? (
          <Image
            source={{ uri: photo }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            onError={() => setFailed(true)}
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#b8b4ad', fontSize: 12 }}>No photo</Text>
          </View>
        )}
      </View>
      <Text numberOfLines={1} style={{ fontWeight: '700', fontSize: 14.5, marginTop: 8 }}>
        {listing.title}
      </Text>
      <Text numberOfLines={1} style={{ color: '#666', fontSize: 12.5, marginTop: 2 }}>
        {sellerLine}
      </Text>
      <Text
        style={{ fontWeight: '700', fontSize: 15, marginTop: 2, color: listing.price > 0 ? '#111' : '#990000' }}
      >
        {priceLabel(listing.price)}
      </Text>
    </Pressable>
  );
}
