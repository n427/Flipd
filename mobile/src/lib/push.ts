import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from './supabase';

// Registers this device for push and stores the token against the signed-in
// user. Safe to call on every launch — it's idempotent (upsert on token).
//
// IMPORTANT: remote push requires a native dev/production build with an EAS
// projectId. In Expo Go (SDK 53+) there is no push support, so this no-ops
// cleanly rather than throwing.
export async function registerForPush(userId: string): Promise<void> {
  // Simulators/web can't receive push.
  if (!Device.isDevice || Platform.OS === 'web') return;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  // No projectId (e.g. Expo Go, or EAS not initialized) → can't mint a token.
  if (!projectId) return;

  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return;

    // Android needs a channel for notifications to display.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return;

    await supabase
      .from('push_tokens')
      .upsert({ user_id: userId, token, platform: Platform.OS }, { onConflict: 'token' });
  } catch {
    // Push is a nice-to-have — never let registration break the app.
  }
}

// Remove this device's token (call on sign-out so a shared device stops
// receiving the previous user's notifications).
export async function unregisterPush(): Promise<void> {
  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (token) await supabase.from('push_tokens').delete().eq('token', token);
  } catch {
    // ignore
  }
}
