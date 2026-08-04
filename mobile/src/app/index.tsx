import { Redirect } from 'expo-router';
import { View, Text } from 'react-native';
import { useSession } from '@/lib/session';
import { T, F } from '@/lib/theme';

// Entry route for '/'. Redirects to the right group once the session loads,
// so the router always has a match at the root (avoids "unmatched route").
export default function Index() {
  const { session, loading, onboarded } = useSession();

  // Signed in but the profile check hasn't landed yet — hold the splash rather
  // than routing to the feed and yanking the user into setup a moment later.
  if (loading || (session && onboarded === 'unknown')) {
    // Plain white with the wordmark and nothing else. No spinner: the wait is
    // usually a few hundred ms, and a spinner appearing and vanishing reads as
    // jitter rather than progress.
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.bg }}>
        <Text style={{ fontFamily: F.black, fontSize: 52, color: T.ink, letterSpacing: -1.5 }}>
          Flipd<Text style={{ color: T.cardinal }}>.</Text>
        </Text>
      </View>
    );
  }
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  return <Redirect href={onboarded === 'no' ? '/(onboarding)/setup' : '/(tabs)/feed'} />;
}
