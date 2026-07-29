import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { SessionProvider, useSession } from '@/lib/session';

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
  return (
    <SessionProvider>
      <AuthWatcher />
    </SessionProvider>
  );
}
