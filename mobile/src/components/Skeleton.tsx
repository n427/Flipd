import { useEffect, useRef, ReactNode } from 'react';
import { View, Animated, Easing, DimensionValue, StyleProp, ViewStyle } from 'react-native';
import { T } from '@/lib/theme';

/**
 * Shared loading primitives.
 *
 * A spinner says "something is happening" but not what, and on a fast
 * connection it flashes in and out as pure noise. A skeleton in the shape of
 * the content that is coming reads as the page filling in, keeps layout stable
 * so nothing jumps when data lands, and tells the user what to expect.
 *
 * Wrap a group in <SkeletonGroup> so every bar pulses on one shared clock —
 * independent animations look like static.
 */

const PULSE_MS = 750;

/** Drives the shared opacity value. Cheap: one animation per group. */
function usePulse() {
  const pulse = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: PULSE_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.55,
          duration: PULSE_MS,
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

/**
 * One gray placeholder block. `width` accepts a percentage string so rows can
 * vary naturally — uniform bars read as a grid, not as text.
 */
export function SkeletonBar({
  width = '100%',
  height = 12,
  radius = 6,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const pulse = usePulse();
  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: T.rule, opacity: pulse }, style]}
    />
  );
}

/** Circular placeholder, for avatars and thumbnails. */
export function SkeletonCircle({ size = 44, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  const pulse = usePulse();
  return (
    <Animated.View
      style={[
        { width: size, height: size, borderRadius: size / 2, backgroundColor: T.rule, opacity: pulse },
        style,
      ]}
    />
  );
}

/** Simple layout wrapper so callers don't repeat the same View styling. */
export function SkeletonGroup({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={style}>{children}</View>;
}

/**
 * A chat thread mid-load: alternating incoming and outgoing bubbles. Widths
 * vary so it reads as conversation rather than a list.
 */
export function SkeletonChat() {
  const rows: { mine: boolean; width: DimensionValue; height: number }[] = [
    { mine: false, width: '62%', height: 38 },
    { mine: true, width: '48%', height: 30 },
    { mine: false, width: '72%', height: 52 },
    { mine: true, width: '40%', height: 30 },
    { mine: false, width: '55%', height: 30 },
  ];
  return (
    <View style={{ flex: 1, paddingHorizontal: 4, gap: 12, justifyContent: 'flex-end', paddingBottom: 12 }}>
      {rows.map((r, i) => (
        <View key={i} style={{ alignItems: r.mine ? 'flex-end' : 'flex-start' }}>
          <SkeletonBar width={r.width} height={r.height} radius={16} />
        </View>
      ))}
    </View>
  );
}

/** A list of request/thread cards mid-load. */
export function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <View style={{ gap: 10 }}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            borderWidth: 1,
            borderColor: T.rule,
            borderRadius: 14,
            padding: 14,
            backgroundColor: '#fff',
          }}
        >
          <SkeletonCircle size={40} />
          <View style={{ flex: 1, gap: 7 }}>
            <SkeletonBar width="55%" height={13} />
            <SkeletonBar width="80%" height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}
