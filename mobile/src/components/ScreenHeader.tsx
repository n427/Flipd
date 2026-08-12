import { ReactNode } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { T, F, S } from '@/lib/theme';

/**
 * The single header for pushed screens.
 *
 * Owns the back affordance so no screen hand-rolls one again, and standardises
 * on Feather's chevron-left (screens previously mixed Feather and Ionicons).
 *
 * Renders INSIDE the screen's existing `SafeAreaView edges={['top']}` — it does
 * not add one, and it does not apply the top inset itself. `S.screenTop` here
 * is the breathing room below that inset, per the contract in theme.ts.
 *
 * Large page titles stay in the scroll content where they already live, so they
 * still scroll away. Pass `title` only when a screen wants it pinned in the bar.
 */
export function ScreenHeader({
  title,
  right,
  onBack,
}: {
  title?: string;
  right?: ReactNode;
  onBack?: () => void;
}) {
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
      <Pressable
        onPress={onBack ?? (() => router.back())}
        hitSlop={10}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
      >
        <Feather name="chevron-left" size={20} color={T.muted} />
        <Text style={{ fontFamily: F.medium, fontSize: 15, color: T.muted }}>Back</Text>
      </Pressable>

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
