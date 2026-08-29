import { Redirect } from 'expo-router';
import { useSession } from '@/lib/session';

// Entry route for '/'. Redirects to the right group once the session loads,
// so the router always has a match at the root (avoids "unmatched route").
export default function Index() {
  const { session, loading, onboarded } = useSession();

  // Signed in but the profile check hasn't landed yet — hold the splash rather
  // than routing to the feed and yanking the user into setup a moment later.
  if (loading || (session && onboarded === 'unknown')) {
    return null;
  }
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  return <Redirect href={onboarded === 'no' ? '/(onboarding)/setup' : '/(tabs)/feed'} />;
}
