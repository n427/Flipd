import { ReactNode } from 'react';
import { View } from 'react-native';
import { GESTURES_SUPPORTED } from '@/lib/gestures';

/**
 * Swipe from the left edge to go back.
 *
 * The gesture needs Reanimated worklets, which Expo Go's runtime does not
 * ship. Importing them at the top level crashes the screen there, so the real
 * implementation is required lazily and only when it can actually run. In
 * Expo Go this is a passthrough: no swipe, but the back button still works.
 */
export function EdgeSwipeBack({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  if (GESTURES_SUPPORTED) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- must stay lazy; a static import crashes Expo Go
    const { EdgeSwipeBackGesture } =
      require('./EdgeSwipeBackGesture') as typeof import('./EdgeSwipeBackGesture');
    return <EdgeSwipeBackGesture onBack={onBack}>{children}</EdgeSwipeBackGesture>;
  }
  return <View style={{ flex: 1 }}>{children}</View>;
}
