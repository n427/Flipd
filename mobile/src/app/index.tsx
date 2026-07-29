import { Redirect } from 'expo-router';
import { View, Text, ActivityIndicator } from 'react-native';
import { useSession } from '@/lib/session';
import { T, F } from '@/lib/theme';

// Entry route for '/'. Redirects to the right group once the session loads,
// so the router always has a match at the root (avoids "unmatched route").
export default function Index() {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.cardinal, gap: 22 }}>
        <Text style={{ fontFamily: F.black, fontSize: 52, color: '#fff', letterSpacing: -1.5 }}>
          flipd<Text style={{ color: T.gold }}>.</Text>
        </Text>
        <ActivityIndicator color="rgba(255,255,255,0.8)" />
      </View>
    );
  }
  return <Redirect href={session ? '/(tabs)/feed' : '/(auth)/sign-in'} />;
}
