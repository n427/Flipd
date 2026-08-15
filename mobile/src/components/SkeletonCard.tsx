import { View, Animated } from 'react-native';
import { T, S } from '@/lib/theme';
import { usePulse, Bar } from '@/components/Skeletons';

// Placeholder card that matches ListingCard's layout, with a gentle pulse so
// the loading state reads as content-shaped rather than a bare spinner.
// Shares its pulse loop with every other skeleton via usePulse.
export function SkeletonCard() {
  const pulse = usePulse();

  return (
    <View style={{ flex: 1, margin: 6 }}>
      <Animated.View
        style={{ aspectRatio: 1, borderRadius: 12, backgroundColor: T.rule, opacity: pulse }}
      />
      <Bar pulse={pulse} w="80%" h={14} style={{ marginTop: 10 }} />
      <Bar pulse={pulse} w="60%" h={11} style={{ marginTop: 8 }} />
      <Bar pulse={pulse} w="35%" h={13} style={{ marginTop: 8 }} />
    </View>
  );
}

// Two-column grid of placeholder cards, matching the numColumns={2} lists on
// Saved and My listings. Lives here rather than in Skeletons to keep the
// import one-directional: SkeletonCard depends on Skeletons, never the reverse.
//
// It reproduces the page title (and My listings' filter pills) rather than
// starting straight in on cards. Without them the grid sat directly under the
// header and then everything shifted down when the real title appeared — the
// exact jump a skeleton exists to prevent.
export function CardGridSkeleton({
  count = 4,
  titleWidth = 120,
  pills = 0,
}: {
  count?: number;
  titleWidth?: number;
  pills?: number;
}) {
  const pulse = usePulse();

  return (
    <View style={{ paddingTop: S.screenTop }}>
      <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
        <Bar pulse={pulse} w={titleWidth} h={26} />
      </View>

      {pills > 0 ? (
        <View style={{ flexDirection: 'row', gap: 7, paddingHorizontal: 16, paddingBottom: 12 }}>
          {Array.from({ length: pills }, (_, i) => (
            <Bar key={i} pulse={pulse} w={78} h={33} r={999} />
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10 }}>
        {Array.from({ length: count }, (_, i) => (
          <View key={i} style={{ width: '50%' }}>
            <SkeletonCard />
          </View>
        ))}
      </View>
    </View>
  );
}
