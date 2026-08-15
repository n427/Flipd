import { useState } from 'react';
import { View, Text, FlatList, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { photoCrop } from '@/lib/photoCrop';

// One carousel slide that falls back to a placeholder if the image fails to
// load (broken URL), instead of showing a blank box.
//
// `focus` and `zoom` are the crop the seller chose. Without them the photo was
// centre-cropped, so a carefully framed listing opened showing the original
// framing instead. Overflow is hidden so a zoomed photo stays in its frame.
function Slide({
  uri,
  size,
  focus,
  zoom,
}: {
  uri: string;
  size: number;
  focus?: string | null;
  zoom?: string | null;
}) {
  const [failed, setFailed] = useState(false);
  const crop = photoCrop(focus, zoom);

  if (failed) {
    return (
      <View style={{ width: size, height: size, backgroundColor: '#f0efec', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#b8b4ad' }}>No photo</Text>
      </View>
    );
  }
  return (
    <View style={{ width: size, height: size, overflow: 'hidden' }}>
      <Image
        source={{ uri }}
        style={{ width: size, height: size, transform: [{ scale: crop.scale }] }}
        contentFit="cover"
        contentPosition={crop.contentPosition}
        onError={() => setFailed(true)}
      />
    </View>
  );
}

export function PhotoCarousel({
  photos,
  focus,
  zoom,
}: {
  photos: string[];
  focus?: string[] | null;
  zoom?: string[] | null;
}) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);

  if (!photos.length) {
    return (
      <View style={{ width, height: width, backgroundColor: '#f0efec', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#b8b4ad' }}>No photo</Text>
      </View>
    );
  }

  return (
    <View>
      <FlatList
        data={photos}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(uri, i) => `${i}-${uri}`}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item, index: i }) => (
          <Slide uri={item} size={width} focus={focus?.[i]} zoom={zoom?.[i]} />
        )}
      />
      {photos.length > 1 && (
        <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center', paddingVertical: 10 }}>
          {photos.map((_, i) => (
            <View
              key={i}
              style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: i === index ? '#111' : '#ccc' }}
            />
          ))}
        </View>
      )}
    </View>
  );
}
