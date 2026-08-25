import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { F, S, T } from '@/lib/theme';

export default function WantedPostPlaceholder() {
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
      <View style={{ flex: 1, paddingHorizontal: S.gutter, paddingTop: S.screenTop }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8} onPress={() => router.back()}>
          <Text style={{ fontFamily: F.bold, fontSize: 15, color: T.cardinal }}>Back</Text>
        </Pressable>
        <Text style={{ fontFamily: F.black, fontSize: 28, color: T.ink, letterSpacing: -0.8, marginTop: 24 }}>Request something</Text>
        <Text style={{ fontFamily: F.medium, fontSize: 15, color: T.muted, marginTop: 8 }}>
          The request form is being prepared.
        </Text>
      </View>
    </SafeAreaView>
  );
}
