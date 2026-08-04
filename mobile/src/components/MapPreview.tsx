import { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, ActivityIndicator, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { T, F } from '@/lib/theme';

const MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

// Static-map preview for a picked pickup spot.
//
// Deliberately uses React Native's built-in Image rather than expo-image: the
// Static Maps URL has no file extension (it's `/staticmap?...`), and expo-image
// can resolve that to a 200 response it never paints — the map area just stays
// white and onError never fires, because the request itself succeeded. RN's
// Image sniffs the decoded bytes instead, so the PNG renders.
//
// The explicit loading/failed states mean a broken map can never silently
// degrade to a blank rectangle again: you get a spinner, or a labelled retry.
export function MapPreview({
  lat,
  lng,
  height = 140,
  label,
}: {
  lat: number;
  lng: number;
  height?: number;
  label?: string;
}) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);

  // A new spot is a new image — go back to loading so the spinner reflects
  // the fetch actually in flight rather than the previous pin's outcome.
  useEffect(() => {
    setStatus('loading');
  }, [lat, lng, attempt]);

  const uri =
    `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}` +
    `&zoom=16&size=640x320&scale=2&maptype=roadmap` +
    `&markers=color:0x990000%7C${lat},${lng}` +
    `&key=${MAPS_KEY}`;

  const openInMaps = () => {
    const q = label ? encodeURIComponent(label) : `${lat},${lng}`;
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`);
  };

  if (!MAPS_KEY) return null;

  if (status === 'failed') {
    return (
      <Pressable
        onPress={() => setAttempt((a) => a + 1)}
        style={{
          height,
          borderRadius: 14,
          backgroundColor: T.fieldbg,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        <Ionicons name="map-outline" size={20} color={T.muted} />
        <Text style={{ fontFamily: F.medium, fontSize: 12.5, color: T.muted }}>
          Map didn’t load · tap to retry
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={openInMaps}
      style={{ height, borderRadius: 14, overflow: 'hidden' }}
    >
      <Image
        // Remount on retry so a failed load is genuinely re-requested.
        key={`${lat},${lng},${attempt}`}
        source={{ uri }}
        style={{ width: '100%', height: '100%', backgroundColor: T.fieldbg }}
        resizeMode="cover"
        onLoad={() => setStatus('ready')}
        onError={() => setStatus('failed')}
      />
      {status === 'loading' ? (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: T.fieldbg,
          }}
        >
          <ActivityIndicator size="small" color={T.muted} />
        </View>
      ) : null}
      {status === 'ready' ? (
        <View
          style={{
            position: 'absolute',
            right: 10,
            bottom: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
            backgroundColor: 'rgba(255,255,255,0.94)',
          }}
        >
          <Ionicons name="navigate-outline" size={12} color={T.ink} />
          <Text style={{ fontFamily: F.semibold, fontSize: 11.5, color: T.ink }}>Open</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
