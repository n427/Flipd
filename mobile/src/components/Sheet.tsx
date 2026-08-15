import { ReactNode, useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Pressable,
  StyleProp,
  ViewStyle,
  Animated,
  Easing,
  StyleSheet,
  Keyboard,
  Platform,
} from 'react-native';
import { GESTURES_SUPPORTED } from '@/lib/gestures';
import { T } from '@/lib/theme';

/**
 * Bottom sheet that can be swiped down to dismiss.
 *
 * The swipe needs Reanimated worklets, which Expo Go's runtime does not ship
 * (Reanimated 4 moved them into react-native-worklets). Importing that module
 * at the top level crashes the screen in Expo Go with `Exception in
 * HostFunction`, so the animated implementation lives in a separate module
 * that is only required when the runtime can actually run it.
 *
 * In Expo Go this renders a plain sheet: no drag, but the scrim tap, the close
 * controls, and everything inside still work. In a development build you get
 * the gesture.
 */
export function Sheet(props: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  if (GESTURES_SUPPORTED) {
    // Required lazily: a top-level import would run in Expo Go too and crash.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- must stay lazy; a static import crashes Expo Go
    const { SwipeSheet } = require('./SwipeSheet') as typeof import('./SwipeSheet');
    return <SwipeSheet {...props} />;
  }
  return <StaticSheet {...props} />;
}

/**
 * Height of the on-screen keyboard, for sheets that hold a text field.
 *
 * A sheet is pinned to the bottom of the screen, which is exactly where the
 * keyboard appears — so without this the keyboard covers the very inputs the
 * sheet exists to collect. The message-the-seller sheet was unusable for that
 * reason: you could focus the field but not see what you typed.
 *
 * `Will` events on iOS so the sheet moves with the keyboard rather than after
 * it; Android only emits the `Did` pair.
 */
export function useKeyboardInset() {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => setInset(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setInset(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return inset;
}

/** No-gesture fallback. Same layout, dismissed via scrim tap or a close control. */
function StaticSheet({
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
  // Modal unmounts its children the instant `visible` flips, which would cut
  // the close animation off. Latch it open until the animation has finished.
  const [mounted, setMounted] = useState(visible);
  const anim = useRef(new Animated.Value(0)).current;
  const [travel, setTravel] = useState(SHEET_TRAVEL_FALLBACK);
  const keyboard = useKeyboardInset();

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(anim, {
        toValue: 1,
        duration: OPEN_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(anim, {
        toValue: 0,
        duration: CLOSE_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, anim]);

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        {/* Scrim fills the whole modal and fades in place. It must not be inside
            a sliding container, or the black rectangle travels up with the
            sheet. */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: anim }]}>
          <Pressable style={{ flex: 1, backgroundColor: SCRIM }} onPress={onClose} />
        </Animated.View>
        {/* Pinned to the bottom, not a flex sibling — see the note in
            SwipeSheet: as a sibling it reserved a sheet-height strip that the
            entry animation left empty and see-through. */}
        <Animated.View
          onLayout={(e) => setTravel(e.nativeEvent.layout.height)}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: keyboard,
            transform: [
              { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [travel, 0] }) },
            ],
          }}
        >
          <View style={[sheetBody, contentStyle]}>{children}</View>
        </Animated.View>
      </View>
    </Modal>
  );
}

export const SCRIM = 'rgba(0,0,0,0.4)';
export const OPEN_MS = 260;
export const CLOSE_MS = 190;
/** Used for the first frame, before onLayout reports the real sheet height. */
export const SHEET_TRAVEL_FALLBACK = 600;

export const sheetBody = {
  backgroundColor: '#fff',
  borderTopLeftRadius: 22,
  borderTopRightRadius: 22,
  paddingHorizontal: 22,
  paddingTop: 10,
  paddingBottom: 34,
} as const;

/** The drag affordance. Also reads as a sheet handle when the gesture is absent. */
export function SheetGrabber() {
  return (
    <View
      style={{
        alignSelf: 'center',
        width: 38,
        height: 4,
        borderRadius: 2,
        backgroundColor: T.rule,
        marginBottom: 16,
      }}
    />
  );
}
