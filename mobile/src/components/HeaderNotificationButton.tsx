import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { T } from '@/lib/theme';
import { useUnread } from '@/lib/unread';

export function HeaderNotificationButton() {
  const router = useRouter();
  const { eventsCount } = useUnread();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={eventsCount > 0 ? `Notifications, ${eventsCount} unread` : 'Notifications'}
      hitSlop={8}
      onPress={() => router.push('/(tabs)/notifications')}
      style={({ pressed }) => ({
        width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
        backgroundColor: pressed ? T.fieldbg : T.surface, borderWidth: 1, borderColor: T.rule,
      })}
    >
      <Feather name="bell" size={20} color={T.ink} />
      {eventsCount > 0 ? (
        <View style={{ position: 'absolute', top: 8, right: 8, width: 9, height: 9, borderRadius: 5, backgroundColor: T.cardinal, borderWidth: 1.5, borderColor: T.surface }} />
      ) : null}
    </Pressable>
  );
}
