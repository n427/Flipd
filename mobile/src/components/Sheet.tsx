import { ReactNode } from 'react';
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

const DISMISS_DISTANCE = 120; // px dragged before we let go of it
const DISMISS_VELOCITY = 800; // or a fast flick, whichever comes first

/**
 * Bottom sheet you can swipe down to dismiss.
 *
 * RN's Modal has no dismiss gesture of its own, so every drawer in the app
 * could only be closed by finding the X or tapping the scrim. This adds the
 * gesture people expect, keeping the scrim tap and hardware back button.
 *
 * A drag past DISMISS_DISTANCE or a fast downward flick closes it; anything
 * short of that springs back, so a hesitant swipe never loses the sheet.
 */
export function Sheet({
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

  const close = () => {
    y.value = 0; // reset so the next open starts seated
    onClose();
  };

  const pan = Gesture.Pan()
    // Downward only: an upward drag would otherwise lift the sheet off the
    // bottom of the screen and expose the scrim beneath it.
    .onChange((e) => {
      y.value = Math.max(0, y.value + e.changeY);
    })
    .onEnd((e) => {
      if (y.value > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
        // Animate the rest of the way out, then unmount on the JS thread.
        y.value = withTiming(600, { duration: 180 }, (done) => {
          if (done) runOnJS(close)();
        });
      } else {
        y.value = withSpring(0, { damping: 20, stiffness: 220 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  // Fade the scrim as the sheet travels, so the dismiss reads as one motion.
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [0, 300], [1, 0], Extrapolation.CLAMP),
  }));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <Animated.View style={[{ flex: 1 }, scrimStyle]}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={close} />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={sheetStyle}>
          <View
            style={[
              {
                backgroundColor: '#fff',
                borderTopLeftRadius: 22,
                borderTopRightRadius: 22,
                paddingHorizontal: 22,
                paddingTop: 10,
                paddingBottom: 34,
              },
              contentStyle,
            ]}
          >
            {children}
          </View>
        </Animated.View>
      </GestureDetector>
    </Modal>
  );
}

/** The drag affordance. Its presence is what tells people the sheet is draggable. */
export function SheetGrabber() {
  return (
    <View
      style={{
        alignSelf: 'center',
        width: 38,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#EAE6DF',
        marginBottom: 16,
      }}
    />
  );
}
