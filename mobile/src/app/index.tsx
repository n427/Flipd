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
    // No spinner: the wordmark alone reads as a splash, and this screen shares
    // its white background with the native splash before it, so the hand-off
    // is invisible rather than a flash of a different colour.
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
