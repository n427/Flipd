import { View, Text } from 'react-native';

// Temporary entry screen — replaced by the auth gate (redirects to sign-in
// or tabs based on session) in a later step.
export default function Index() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 28, fontWeight: '800' }}>flipd.</Text>
    </View>
  );
}
