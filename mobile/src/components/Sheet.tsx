import { ReactNode } from 'react';
import { Modal, View, Pressable, StyleProp, ViewStyle } from 'react-native';
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
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={onClose} />
      <View style={[sheetBody, contentStyle]}>{children}</View>
    </Modal>
  );
}

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
