import { View, Text, Pressable, Linking } from 'react-native';
import { LegalScreen } from '@/components/LegalScreen';
import { SUPPORT, SUPPORT_FAQ, SUPPORT_EMAIL } from '@/lib/legal';
import { T, F } from '@/lib/theme';

export default function Support() {
  return (
    <LegalScreen doc={SUPPORT}>
      <View style={{ marginTop: 24 }}>
        <Text style={{ fontFamily: F.bold, fontSize: 15.5, color: T.ink, marginBottom: 8 }}>
          Common questions
        </Text>
        {SUPPORT_FAQ.map((f) => (
          <View key={f.q} style={{ marginBottom: 14 }}>
            <Text style={{ fontFamily: F.semibold, fontSize: 14.5, color: T.ink, marginBottom: 3 }}>
              {f.q}
            </Text>
            <Text style={{ fontFamily: F.regular, fontSize: 14.5, lineHeight: 22, color: '#333' }}>
              {f.a}
            </Text>
          </View>
        ))}
      </View>

      <View style={{ marginTop: 10 }}>
        <Text style={{ fontFamily: F.bold, fontSize: 15.5, color: T.ink, marginBottom: 8 }}>
          Still need help?
        </Text>
        <Text
          style={{
            fontFamily: F.regular,
            fontSize: 14.5,
            lineHeight: 22,
            color: '#333',
            marginBottom: 14,
          }}
        >
          Email us and we&rsquo;ll get back to you.
        </Text>
        <Pressable
          onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
          style={{
            backgroundColor: T.cardinal,
            borderRadius: 12,
            paddingVertical: 13,
            alignItems: 'center',
          }}
        >
          <Text style={{ fontFamily: F.bold, fontSize: 15, color: '#fff' }}>Email support</Text>
        </Pressable>
      </View>
    </LegalScreen>
  );
}
