import { ReactNode, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';

const EDGE_WIDTH = 40; // how far in from the left the drag must start
const DISMISS_DISTANCE = 90; // drag past this and we commit to going back
const DISMISS_VELOCITY = 700; // or flick faster than this

/**
 * iOS-style swipe-from-left-edge to go back. Only loaded when the runtime
 * supports Reanimated worklets — see EdgeSwipeBack.tsx.
 *
 * These screens live in the Tabs navigator, which has no back stack and so
 * provides no swipe gesture of its own. Rather than restructuring the routes,
 * this recreates the gesture locally and calls the same `onBack` the header
 * button uses, so both paths land in the same place.
 *
 * `activeOffsetX` means a mostly-vertical drag is ignored, so scrolling the
 * page still works normally.
 */
export function EdgeSwipeBackGesture({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  const x = useSharedValue(0);

  // A committed swipe parks the screen 400px off-canvas and then navigates.
  // Tabs keeps these screens mounted, so re-entering reused the same shared
  // value and the screen rendered still shifted off — it looked like the
  // route simply refused to open. Re-seat it every time we regain focus.
  useFocusEffect(
    useCallback(() => {
      x.value = 0;
    }, [x]),
  );

  const pan = Gesture.Pan()
    .hitSlop({ left: 0, width: EDGE_WIDTH })
    .activeOffsetX(12)
    .failOffsetY([-14, 14])
    .onChange((e) => {
      x.value = Math.max(0, x.value + e.changeX);
    })
    .onEnd((e) => {
      if (x.value > DISMISS_DISTANCE || e.velocityX > DISMISS_VELOCITY) {
        // Slide the rest of the way out, then navigate on the JS thread.
        x.value = withTiming(400, { duration: 160 }, (done) => {
          if (done) runOnJS(onBack)();
        });
      } else {
        x.value = withTiming(0, { duration: 140 });
      }
    });

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[{ flex: 1 }, style]}>{children}</Animated.View>
    </GestureDetector>
  );
}
