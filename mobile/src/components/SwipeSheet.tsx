import { ReactNode, useEffect, useState } from 'react';
import { Modal, View, Pressable, StyleProp, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
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

  // Entry/exit offset plus whatever the finger has dragged.
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value + (1 - progress.value) * travel }],
  }));
  // Fade the scrim as the sheet travels, so the dismiss reads as one motion.
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: progress.value * interpolate(y.value, [0, 300], [1, 0], Extrapolation.CLAMP),
  }));

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={close}>
      {/* Scrim fades in place. It must not be inside a sliding container, or
          the black rectangle travels up the screen with the sheet. */}
      <Animated.View style={[{ flex: 1 }, scrimStyle]}>
        <Pressable style={{ flex: 1, backgroundColor: SCRIM }} onPress={close} />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View onLayout={(e) => setTravel(e.nativeEvent.layout.height)} style={sheetStyle}>
          <View style={[sheetBody, contentStyle]}>{children}</View>
        </Animated.View>
      </GestureDetector>
    </Modal>
  );
}
