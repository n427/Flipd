import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { FeedListing, priceLabel } from '@/lib/listings';
import { photoCrop } from '@/lib/photoCrop';
import { isPopupCategory } from '@/lib/events';
import { T, F } from '@/lib/theme';
import { listingCardAccessibilityLabel } from '@/lib/listingAccessibility';

export function ListingCard({ listing, onPress }: { listing: FeedListing; onPress: () => void }) {
  const [failed, setFailed] = useState(false);
  const photo = listing.photo_urls[0];
  const crop = photoCrop(listing.photo_focus?.[0], listing.photo_zoom?.[0]);
  const sellerLine =
    [
      listing.seller?.display_name?.split(' ')[0],
      listing.seller?.school_unit,
      listing.seller?.class_year,
    ]
      .filter(Boolean)
      .join(' · ') || (listing.location ?? 'USC · pickup');
  const cardPrice = isPopupCategory(listing.category) ? 'Popup' : priceLabel(listing.price);

  return (
    // maxWidth caps a lone card at half the row. Without it `flex: 1` lets the
    // last item in an odd-length list stretch to full width, since there's no
    // sibling to share the row with.
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={listingCardAccessibilityLabel({
        title: listing.title,
        price: cardPrice,
        seller: sellerLine,
      })}
      style={{ flex: 1, maxWidth: '50%', margin: 6, marginBottom: 22 }}
    >
      <View style={{ aspectRatio: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: '#f0efec' }}>
        {photo && !failed ? (
          <Image
            source={{ uri: photo }}
            // Same crop the seller framed, so a card and its listing show the
            // same photo. The wrapper already clips, so a zoom stays in frame.
            style={{ width: '100%', height: '100%', transform: [{ scale: crop.scale }] }}
            contentFit="cover"
            contentPosition={crop.contentPosition}
            onError={() => setFailed(true)}
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: F.medium, color: '#b8b4ad', fontSize: 12 }}>No photo</Text>
          </View>
        )}
      </View>
      <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 15, marginTop: 11, color: T.ink }}>
        {listing.title}
      </Text>
      <Text numberOfLines={1} style={{ fontFamily: F.regular, color: T.muted, fontSize: 12.5, marginTop: 5 }}>
        {sellerLine}
      </Text>
      {/* Popups aren't priced — the web card leaves the price label empty for
          them rather than advertising a misleading "Free". */}
      {isPopupCategory(listing.category) ? (
        <Text style={{ fontFamily: F.bold, fontSize: 13.5, marginTop: 6, color: T.cardinal }}>Popup</Text>
      ) : (
        <Text
          style={{ fontFamily: F.bold, fontSize: 15.5, marginTop: 6, color: listing.price > 0 ? T.ink : T.cardinal }}
        >
          {priceLabel(listing.price)}
        </Text>
      )}
    </Pressable>
  );
}
