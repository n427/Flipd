import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { F, S, T } from '@/lib/theme';

type ChoiceProps = {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  body: string;
  onPress: () => void;
};

function Choice({ icon, title, body, onPress }: ChoiceProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20,
        borderWidth: 1, borderColor: T.rule, borderRadius: 20,
        backgroundColor: pressed ? T.fieldbg : T.surface,
      })}
    >
      <View style={{ width: 48, height: 48, borderRadius: 15, backgroundColor: T.fieldbg, alignItems: 'center', justifyContent: 'center' }}>
        <Feather name={icon} size={23} color={T.cardinal} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.extrabold, fontSize: 18, color: T.ink }}>{title}</Text>
        <Text style={{ fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: T.muted, marginTop: 3 }}>{body}</Text>
      </View>
      <Feather name="chevron-right" size={21} color={T.muted} />
    </Pressable>
  );
}

export default function PostChooser() {
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
      <View style={{ flex: 1, paddingHorizontal: S.gutter, paddingTop: S.screenTop }}>
        <Text style={{ fontFamily: F.black, fontSize: 28, color: T.ink, letterSpacing: -0.8 }}>What do you want to do?</Text>
        <Text style={{ fontFamily: F.regular, fontSize: 15, color: T.muted, marginTop: 7, marginBottom: 24 }}>
          Sell what you have, or tell campus what you need.
        </Text>
        <View style={{ gap: 12 }}>
          <Choice icon="tag" title="Sell something" body="Create a marketplace listing." onPress={() => router.push('/sell/post')} />
          <Choice icon="search" title="Request something" body="Post what you want to buy." onPress={() => router.push('/wanted/post')} />
        </View>
      </View>
    </SafeAreaView>
  );
}
