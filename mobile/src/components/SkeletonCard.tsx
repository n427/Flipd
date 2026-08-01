import { useEffect, useRef } from 'react';
import { View, Animated, Easing } from 'react-native';
import { T } from '@/lib/theme';

// Placeholder card that matches ListingCard's layout, with a gentle pulse so
// the loading state reads as content-shaped rather than a bare spinner.
export function SkeletonCard() {
  const pulse = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const bar = (w: number | string, h: number, mt: number) => (
    <Animated.View
      style={{ width: w as number, height: h, borderRadius: 6, backgroundColor: T.rule, marginTop: mt, opacity: pulse }}
    />
  );

  return (
    <View style={{ flex: 1, margin: 6 }}>
      <Animated.View style={{ aspectRatio: 1, borderRadius: 12, backgroundColor: T.rule, opacity: pulse }} />
      {bar('80%', 14, 10)}
      {bar('60%', 11, 8)}
      {bar('35%', 13, 8)}
    </View>
  );
}
