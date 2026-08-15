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
// Why registration stopped, for the dev console. Every branch below is a silent
// return in production — push is a nice-to-have and must never break the app —
// but silence made "push doesn't work" undiagnosable: permission denied, a
// missing projectId and an RLS rejection all looked identical from outside.
function why(reason: string) {
  if (__DEV__) console.warn(`[push] not registered: ${reason}`);
}

export async function registerForPush(userId: string): Promise<void> {
  // Simulators/web can't receive push.
  if (!Device.isDevice || Platform.OS === 'web') return why('not a physical device');

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  // No projectId (e.g. Expo Go, or EAS not initialized) → can't mint a token.
  if (!projectId) return why('no EAS projectId in the app config');

  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    // The common one: the system prompt is shown once. Dismissed or denied,
    // every later call returns denied and only Settings can undo it.
    if (status !== 'granted') return why(`notification permission is "${status}"`);

    // Android needs a channel for notifications to display.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return why('Expo returned no push token');

    // The upsert's error was previously discarded, so an RLS rejection or a
    // token owned by another account left no token row and no clue.
    const { error } = await supabase
      .from('push_tokens')
      .upsert({ user_id: userId, token, platform: Platform.OS }, { onConflict: 'token' });
    if (error) return why(`storing the token failed: ${error.message}`);

    // Full token in dev: it is a delivery address rather than a credential, and
    // having it makes an end-to-end test possible without a database round trip.
    if (__DEV__) console.log('[push] registered', token);
  } catch (e) {
    // Push is a nice-to-have — never let registration break the app.
    why(e instanceof Error ? e.message : String(e));
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
