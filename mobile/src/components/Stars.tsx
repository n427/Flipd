import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { T } from '@/lib/theme';

/** Five-star display. Halves render as a half glyph, so 4.5 reads honestly. */
export function Stars({ value, size = 15 }: { value: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 1 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Ionicons
          key={n}
          name={value >= n ? 'star' : value >= n - 0.5 ? 'star-half' : 'star-outline'}
          size={size}
          color={T.gold}
        />
      ))}
    </View>
  );
}
