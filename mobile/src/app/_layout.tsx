import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
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
import { openDeepLink } from '@/lib/nav';
import { routeAllowedDuringOnboarding } from '@/lib/onboardingRoute';
import { UnreadProvider } from '@/lib/unread';
import { wantedPushNotificationDestination } from '@/lib/wanted';
import * as SplashScreen from 'expo-splash-screen';
import { shouldHideSplash } from '@/lib/splashReady';

// Keep the single native Flipd wordmark visible until fonts and auth routing
// are ready. Calling this in module scope avoids the native screen hiding
// before React can take control.
void SplashScreen.preventAutoHideAsync();

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
      const currentRoot = group ? `/${group}` : '/';
      if (!routeAllowedDuringOnboarding(currentRoot)) router.replace('/(onboarding)/setup');
    } else if (group === '(auth)' || group === '(onboarding)') {
      router.replace('/(tabs)/feed');
    }
  }, [session, loading, onboarded, segments, router]);

  // Tapping a reveal push (new request / approval) opens Requests. Routed
  // through openDeepLink so a cold start — the common case for a notification —
  // lands with a screen behind it and back is never a dead button.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const type = res.notification.request.content.data?.type;
      if (type === 'new_request' || type === 'approval') {
        openDeepLink('/(tabs)/requests');
      } else if (typeof type === 'string') {
        const data = res.notification.request.content.data;
        const target = wantedPushNotificationDestination(
          type,
          typeof data.wanted_post_id === 'string' ? data.wanted_post_id : null,
        );
        if (target) openDeepLink(target as Parameters<typeof openDeepLink>[0]);
      }
    });
    return () => sub.remove();
  }, []);

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

function SplashController({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { session, loading, onboarded } = useSession();
  useEffect(() => {
    if (shouldHideSplash({ fontsLoaded, sessionLoading: loading, onboarded, signedIn: !!session })) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, loading, onboarded, session]);
  return null;
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

  return (
    // Required by react-native-gesture-handler: without a root view at the top
    // of the tree every gesture silently does nothing.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SessionProvider>
        <SplashController fontsLoaded={fontsLoaded} />
        <UnreadProvider>
          <AuthWatcher />
        </UnreadProvider>
      </SessionProvider>
    </GestureHandlerRootView>
  );
}
