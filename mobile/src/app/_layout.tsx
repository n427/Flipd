import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
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

// Watches auth state and redirects when the current group disagrees with the
// session: signed-in users leave (auth) -> tabs; signed-out users leave (tabs)
// -> sign-in. The index route ('/') handles the very first landing; this keeps
// things in sync after sign-in / sign-out from any screen.
function AuthWatcher() {
  const { session, loading } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const group = segments[0]; // '(auth)' | '(tabs)' | undefined (index)
    if (session && group === '(auth)') {
      router.replace('/(tabs)/feed');
    } else if (!session && group === '(tabs)') {
      router.replace('/(auth)/sign-in');
    }
  }, [session, loading, segments, router]);

  return <Stack screenOptions={{ headerShown: false }} />;
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
    <SessionProvider>
      <UnreadProvider>
        <AuthWatcher />
      </UnreadProvider>
    </SessionProvider>
  );
}
