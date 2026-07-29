import { Redirect } from 'expo-router';
import { View, Text, ActivityIndicator } from 'react-native';
import { useSession } from '@/lib/session';
import { T } from '@/lib/theme';

// Entry route for '/'. Redirects to the right group once the session loads,
// so the router always has a match at the root (avoids "unmatched route").
export default function Index() {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.bg, gap: 20 }}>
        <Text style={{ fontSize: 44, fontWeight: '900', color: T.ink, letterSpacing: -1.5 }}>
          flipd<Text style={{ color: T.cardinal }}>.</Text>
        </Text>
        <ActivityIndicator color={T.cardinal} />
      </View>
    );
  }
  return <Redirect href={session ? '/(tabs)/feed' : '/(auth)/sign-in'} />;
}
