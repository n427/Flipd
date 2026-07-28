import { Stack } from 'expo-router';

// Root layout. The auth gate (session-based redirect) is added in the
// session task; for now this renders the router stack.
export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
