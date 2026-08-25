import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HeaderNotificationButton } from '@/components/HeaderNotificationButton';
import { F, S, T } from '@/lib/theme';

export default function WantedPlaceholder() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
      <View style={{ paddingHorizontal: S.gutter, paddingTop: S.screenTop }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: F.black, fontSize: 28, color: T.ink, letterSpacing: -0.8 }}>Wanted</Text>
          <HeaderNotificationButton />
        </View>
        <Text style={{ fontFamily: F.medium, fontSize: 15, color: T.muted, marginTop: 24 }}>
          Campus requests will appear here.
        </Text>
      </View>
    </SafeAreaView>
  );
}
