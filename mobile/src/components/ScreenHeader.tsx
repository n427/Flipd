import { ReactNode } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T, F, S } from '@/lib/theme';

/**
 * The single header for pushed screens.
 *
 * Owns the back affordance so no screen hand-rolls one again, and standardises
 * on Feather's chevron-left (screens previously mixed Feather and Ionicons).
 *
 * Two presentations, one affordance:
 *
 * - default: a row at the top of the screen. Renders INSIDE the screen's
 *   existing `SafeAreaView edges={['top']}` — it does not add one, and
 *   `S.screenTop` here is breathing room below that inset, per theme.ts.
 * - floating: the same chevron and label in a translucent pill, absolutely
 *   positioned over full-bleed content. For photo-first screens where a solid
 *   header row would push the image down. Applies the top inset itself, since
 *   absolute positioning takes it out of the SafeAreaView's flow.
 *
 * Large page titles stay in the scroll content where they already live, so they
 * still scroll away. Pass `title` only when a screen wants it pinned in the bar.
 */
export function ScreenHeader({
  title,
  right,
  onBack,
  floating = false,
}: {
  title?: string;
  right?: ReactNode;
  onBack?: () => void;
  floating?: boolean;
}) {
  const insets = useSafeAreaInsets();

  const back = (
    <Pressable
      onPress={onBack ?? (() => router.back())}
      hitSlop={10}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        ...(floating
          ? {
              backgroundColor: 'rgba(255,255,255,0.92)',
              borderRadius: 999,
              paddingVertical: 6,
              paddingLeft: 6,
              paddingRight: 12,
            }
          : null),
      }}
    >
      <Feather name="chevron-left" size={20} color={floating ? T.ink : T.muted} />
      <Text style={{ fontFamily: F.medium, fontSize: 15, color: floating ? T.ink : T.muted }}>
        Back
      </Text>
    </Pressable>
  );

  if (floating) {
    return (
      <View
        style={{
          position: 'absolute',
          top: insets.top + 8,
          left: 14,
          right: 14,
          zIndex: 10,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        {back}
        <View style={{ flex: 1 }} />
        {right ?? null}
      </View>
    );
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: S.gutter,
        paddingTop: S.screenTop,
        paddingBottom: 12,
      }}
    >
      {back}

      {title ? (
        <Text
          numberOfLines={1}
          style={{ flex: 1, marginLeft: 8, fontFamily: F.bold, fontSize: 16, color: T.ink }}
        >
          {title}
        </Text>
      ) : (
        <View style={{ flex: 1 }} />
      )}

      {right ?? null}
    </View>
  );
}
