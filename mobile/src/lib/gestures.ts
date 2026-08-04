import Constants from 'expo-constants';

/**
 * Whether the runtime can actually execute Reanimated worklets.
 *
 * Reanimated 4 moved worklets into `react-native-worklets`, which Expo Go's
 * prebuilt binary does not include. The JS imports resolve fine, so this only
 * fails at call time with `Exception in HostFunction` — which crashes the
 * screen rather than degrading.
 *
 * Gesture-driven components check this and render a plain, non-animated
 * version in Expo Go. Everything stays usable (buttons, scrims, close
 * controls); only the drag gesture is absent. In a development build the
 * gestures run normally.
 */
export const GESTURES_SUPPORTED = Constants.appOwnership !== 'expo';
