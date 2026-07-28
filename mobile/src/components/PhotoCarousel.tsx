import { useState } from 'react';
import { View, Text, FlatList, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';

export function PhotoCarousel({ photos }: { photos: string[] }) {
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
        renderItem={({ item }) => (
          <Image source={{ uri: item }} style={{ width, height: width }} contentFit="cover" />
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
