import { useEffect, useRef } from 'react';
import { View, Animated, Easing, useWindowDimensions, DimensionValue } from 'react-native';
import { T, S } from '@/lib/theme';

/**
 * Content-shaped loading states.
 *
 * A spinner says "something is happening"; these say "this is what is about to
 * be here". The grey blocks sit where the real content lands, so nothing jumps
 * when the data arrives.
 *
 * Use these for *page loads*. Action feedback — saving a form, a map tile
 * resolving — keeps its ActivityIndicator, because there is no incoming
 * content for a placeholder to stand in for.
 */

/**
 * One pulse loop per skeleton, shared by all of its blocks.
 *
 * Deliberately one Animated.Value per screen rather than per block: a dozen
 * independent loops would drift out of phase and read as noise instead of a
 * single surface breathing.
 */
export function usePulse() {
  const pulse = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.5,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return pulse;
}

export function Bar({
  pulse,
  w,
  h,
  r = 8,
  style,
}: {
  pulse: Animated.Value;
  w: DimensionValue;
  h: number;
  r?: number;
  style?: object;
}) {
  return (
    <Animated.View
      style={[
        { width: w, height: h, borderRadius: r, backgroundColor: T.rule, opacity: pulse },
        style,
      ]}
    />
  );
}

/** Square photo (PhotoCarousel is width x width), then title, price, body. */
export function ListingDetailSkeleton() {
  const pulse = usePulse();
  const { width } = useWindowDimensions();

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <Bar pulse={pulse} w={width} h={width} r={0} />
      <View style={{ padding: 20, gap: 12 }}>
        <Bar pulse={pulse} w="70%" h={22} />
        <Bar pulse={pulse} w="30%" h={18} />
        <View style={{ gap: 8, marginTop: 10 }}>
          <Bar pulse={pulse} w="100%" h={12} />
          <Bar pulse={pulse} w="92%" h={12} />
          <Bar pulse={pulse} w="55%" h={12} />
        </View>
      </View>
    </View>
  );
}

/** Avatar, name, meta — matching the centred header on u/[id]. */
export function ProfileSkeleton() {
  const pulse = usePulse();

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <View style={{ padding: 10, alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <Bar pulse={pulse} w={72} h={72} r={36} />
        <Bar pulse={pulse} w={140} h={18} />
        <Bar pulse={pulse} w={96} h={13} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10 }}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ width: '50%', padding: 6 }}>
            <Bar pulse={pulse} w="100%" h={150} r={12} />
            <Bar pulse={pulse} w="80%" h={13} style={{ marginTop: 10 }} />
            <Bar pulse={pulse} w="45%" h={11} style={{ marginTop: 8 }} />
          </View>
        ))}
      </View>
    </View>
  );
}

/** Alternating bubbles, so the thread reads as a conversation before it loads. */
export function ConversationSkeleton() {
  const pulse = usePulse();
  const rows: { mine: boolean; w: DimensionValue; h: number }[] = [
    { mine: false, w: '62%', h: 38 },
    { mine: true, w: '48%', h: 38 },
    { mine: false, w: '72%', h: 56 },
    { mine: true, w: '55%', h: 38 },
    { mine: false, w: '40%', h: 38 },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: T.bg, paddingHorizontal: S.gutter, gap: 10, paddingTop: 10 }}>
      {rows.map((r, i) => (
        <View key={i} style={{ alignItems: r.mine ? 'flex-end' : 'flex-start' }}>
          <Bar pulse={pulse} w={r.w} h={r.h} r={14} />
        </View>
      ))}
    </View>
  );
}

/** Stacked rows for the list screens (notifications, requests, reviews). */
export function ListRowsSkeleton({ count = 6 }: { count?: number }) {
  const pulse = usePulse();

  return (
    <View style={{ flex: 1, backgroundColor: T.bg, paddingHorizontal: S.gutter, paddingTop: 4 }}>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }}
        >
          <Bar pulse={pulse} w={46} h={46} r={10} />
          <View style={{ flex: 1, gap: 8 }}>
            <Bar pulse={pulse} w="65%" h={13} />
            <Bar pulse={pulse} w="40%" h={11} />
          </View>
        </View>
      ))}
    </View>
  );
}
