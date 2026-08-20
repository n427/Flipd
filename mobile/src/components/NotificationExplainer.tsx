import { useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, Text, View } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Sheet, SheetGrabber } from './Sheet';
import { useSession } from '@/lib/session';
import { shouldExplainNotifications } from '@/lib/notificationPrompt';
import { registerForPush } from '@/lib/push';
import { F, T } from '@/lib/theme';

let dismissedForLifecycle = false;

export function NotificationExplainer({ ready }: { ready: boolean }) {
  const { user } = useSession();
  const [visible, setVisible] = useState(false);
  const [enabling, setEnabling] = useState(false);

  useEffect(() => {
    if (!ready || !user) return;
    let alive = true;
    Notifications.getPermissionsAsync().then(({ status }) => {
      if (!alive) return;
      setVisible(
        shouldExplainNotifications({
          physicalDevice: Device.isDevice,
          platform: Platform.OS,
          permission: status,
          dismissed: dismissedForLifecycle,
        }),
      );
    });
    return () => {
      alive = false;
    };
  }, [ready, user]);

  const dismiss = () => {
    dismissedForLifecycle = true;
    setVisible(false);
  };

  const enable = async () => {
    if (!user || enabling) return;
    setEnabling(true);
    const result = await registerForPush(user.id, { requestPermission: true });
    dismiss();
    setEnabling(false);
    if (result === 'denied') {
      Alert.alert(
        'Notifications are off',
        'You can enable Flipd notifications later in Settings.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
    }
  };

  return (
    <Sheet visible={visible} onClose={dismiss} contentStyle={{ paddingHorizontal: 20 }}>
      <SheetGrabber />
      <Text style={{ fontFamily: F.extrabold, fontSize: 20, color: T.ink, letterSpacing: -0.4 }}>
        Know when someone responds
      </Text>
      <Text style={{ fontFamily: F.regular, fontSize: 14.5, lineHeight: 22, color: T.muted, marginTop: 8 }}>
        Flipd can notify you about requests, approvals, messages, and listing reminders. You choose whether to allow notifications.
      </Text>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
        <Pressable
          onPress={dismiss}
          accessibilityRole="button"
          style={{ flex: 1, minHeight: 48, borderRadius: 12, backgroundColor: T.fieldbg, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontFamily: F.bold, fontSize: 15, color: T.ink }}>Not now</Text>
        </Pressable>
        <Pressable
          onPress={enable}
          disabled={enabling}
          accessibilityRole="button"
          accessibilityState={{ busy: enabling, disabled: enabling }}
          style={{ flex: 1, minHeight: 48, borderRadius: 12, backgroundColor: T.cardinal, alignItems: 'center', justifyContent: 'center', opacity: enabling ? 0.65 : 1 }}
        >
          <Text style={{ fontFamily: F.bold, fontSize: 15, color: '#fff' }}>
            {enabling ? 'Enabling…' : 'Enable notifications'}
          </Text>
        </Pressable>
      </View>
    </Sheet>
  );
}
