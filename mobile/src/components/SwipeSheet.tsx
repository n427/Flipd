import { ReactNode, useEffect, useState } from 'react';
import { Modal, View, Pressable, StyleProp, ViewStyle, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedKeyboard,
  withTiming,
  withSpring,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { sheetBody, SCRIM, OPEN_MS, CLOSE_MS, SHEET_TRAVEL_FALLBACK } from './Sheet';

const DISMISS_DISTANCE = 120; // px dragged before we let go of it
const DISMISS_VELOCITY = 800; // or a fast flick, whichever comes first

/**
 * Swipe-to-dismiss sheet. Only loaded when the runtime supports Reanimated
 * worklets — see Sheet.tsx, which picks between this and a static fallback.
 */
export function SwipeSheet({
  visible,
  onClose,
  children,
  contentStyle,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const y = useSharedValue(0);
  // 0 = fully closed, 1 = fully open. Drives the entry/exit; `y` is the drag.
  const progress = useSharedValue(0);
  // Modal drops its children the moment `visible` flips, which would cut the
  // exit animation off. Latch it open until the animation finishes.
  const [mounted, setMounted] = useState(visible);
  const [travel, setTravel] = useState(SHEET_TRAVEL_FALLBACK);
  // Tracked on the UI thread. Driving this from a React state update made the
  // sheet teleport to its new position on re-render instead of travelling with
  // the keyboard — the jumpiness.
  const keyboard = useAnimatedKeyboard();

  useEffect(() => {
    if (visible) {
      setMounted(true);
      y.value = 0; // start seated, even if the last close was a flick
      progress.value = withTiming(1, { duration: OPEN_MS });
    } else {
      progress.value = withTiming(0, { duration: CLOSE_MS }, (done) => {
        if (done) runOnJS(setMounted)(false);
      });
    }
  }, [visible, y, progress]);

  const close = () => onClose();

  const pan = Gesture.Pan()
    // Downward only: an upward drag would lift the sheet off the bottom of the
    // screen and expose the scrim beneath it.
    .onChange((e) => {
      y.value = Math.max(0, y.value + e.changeY);
    })
    .onEnd((e) => {
      if (y.value > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
        y.value = withTiming(600, { duration: 180 }, (done) => {
          if (done) runOnJS(close)();
        });
      } else {
        y.value = withSpring(0, { damping: 20, stiffness: 220 });
      }
    });

  // Entry/exit offset, the drag, and the keyboard — all one transform, so the
  // sheet rides the keyboard's own animation curve frame for frame.
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value + (1 - progress.value) * travel - keyboard.height.value }],
  }));
  // Fade the scrim as the sheet travels, so the dismiss reads as one motion.
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: progress.value * interpolate(y.value, [0, 300], [1, 0], Extrapolation.CLAMP),
  }));

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={close}>
      <View style={{ flex: 1 }}>
        {/* Scrim fills the whole modal and fades in place. It must not be inside
            a sliding container, or the black rectangle travels up with the
            sheet. */}
        <Animated.View style={[StyleSheet.absoluteFill, scrimStyle]}>
          <Pressable style={{ flex: 1, backgroundColor: SCRIM }} onPress={close} />
        </Animated.View>
        {/* Pinned to the bottom rather than laid out as a flex sibling. As a
            sibling it reserved its own height at the bottom of the screen, and
            the entry animation then translated it out of that box — leaving a
            sheet-height strip of nothing, showing through the transparent modal
            to the screen behind, until the sheet slid up into it. */}
        <GestureDetector gesture={pan}>
          <Animated.View
            onLayout={(e) => setTravel(e.nativeEvent.layout.height)}
            style={[{ position: 'absolute', left: 0, right: 0, bottom: 0 }, sheetStyle]}
          >
            <View style={[sheetBody, contentStyle]}>{children}</View>
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}
