import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Notifications from 'expo-notifications';
import {
  useFonts,
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
  Figtree_800ExtraBold,
  Figtree_900Black,
} from '@expo-google-fonts/figtree';
import { SessionProvider, useSession } from '@/lib/session';
import { UnreadProvider } from '@/lib/unread';
import { T } from '@/lib/theme';

// Show a banner even when the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Watches auth state and redirects when the current group disagrees with the
// session: signed-in users leave (auth) -> tabs; signed-out users leave (tabs)
// -> sign-in. The index route ('/') handles the very first landing; this keeps
// things in sync after sign-in / sign-out from any screen.
function AuthWatcher() {
  const { session, loading, onboarded } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const group = segments[0]; // '(auth)' | '(tabs)' | '(onboarding)' | undefined (index)
    if (!session) {
      if (group === '(tabs)' || group === '(onboarding)') router.replace('/(auth)/sign-in');
      return;
    }
    // Signed in. Wait for the profile check before routing anywhere, so a new
    // user never lands on the feed first.
    if (onboarded === 'unknown') return;
    if (onboarded === 'no') {
      // New user: setup comes before the app, whichever way they got here.
      if (group !== '(onboarding)') router.replace('/(onboarding)/setup');
    } else if (group === '(auth)' || group === '(onboarding)') {
      router.replace('/(tabs)/feed');
    }
  }, [session, loading, onboarded, segments, router]);

  // Tapping a reveal push (new request / approval) opens the Requests tab.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const type = res.notification.request.content.data?.type;
      if (type === 'new_request' || type === 'approval') {
        router.push('/(tabs)/requests');
      }
    });
    return () => sub.remove();
  }, [router]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        gestureEnabled: true,
        // iOS: let the drag start anywhere, not just the 20pt edge. This is the
        // behaviour the hand-rolled EdgeSwipeBackGesture was approximating.
        fullScreenGestureEnabled: true,
      }}
    />
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
    Figtree_800ExtraBold,
    Figtree_900Black,
  });

  // Hold on a cardinal splash until Figtree is ready — avoids a flash of the
  // system font on the first screen someone sees.
  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: T.cardinal }} />;
  }

  return (
    // Required by react-native-gesture-handler: without a root view at the top
    // of the tree every gesture silently does nothing.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SessionProvider>
        <UnreadProvider>
          <AuthWatcher />
        </UnreadProvider>
      </SessionProvider>
    </GestureHandlerRootView>
  );
}
