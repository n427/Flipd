import { ReactNode } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { goBackTo } from '@/lib/nav';
import { T, F, S } from '@/lib/theme';
import type { LegalDoc } from '@/lib/legal';

// Shared shell for the static content screens (Terms, Privacy, Support).
// Renders a LegalDoc from @/lib/legal so all three read identically and only
// the copy differs. These are terminal reading screens reached from Profile,
// so they carry an explicit back control rather than relying on the swipe.
export function LegalScreen({ doc, children }: { doc: LegalDoc; children?: ReactNode }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: S.gutter,
          paddingTop: S.screenTop,
          paddingBottom: 48,
        }}
      >
        <Pressable
          // Not router.back(): inside Tabs that pops the *tab* history, so
          // arriving via Feed → Profile → Support sent Back to the feed. These
          // three screens hang off Profile only, so the destination is exact.
          onPress={() => goBackTo('/(tabs)/profile')}
          hitSlop={10}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 14 }}
        >
          <Feather name="chevron-left" size={20} color={T.muted} />
          <Text style={{ fontFamily: F.medium, fontSize: 15, color: T.muted }}>Back</Text>
        </Pressable>

        <Text style={{ fontFamily: F.black, fontSize: 26, color: T.ink, letterSpacing: -0.6 }}>
          {doc.title}
        </Text>

        {doc.updated ? (
          <Text style={{ fontFamily: F.regular, fontSize: 12.5, color: T.muted, marginTop: 6 }}>
            Last updated: {doc.updated}
          </Text>
        ) : null}

        {doc.intro ? (
          <Text
            style={{
              fontFamily: F.regular,
              fontSize: 14.5,
              lineHeight: 22,
              color: '#333',
              marginTop: 16,
            }}
          >
            {doc.intro}
          </Text>
        ) : null}

        {doc.sections.map((s) => (
          <View key={s.heading} style={{ marginTop: 24 }}>
            <Text style={{ fontFamily: F.bold, fontSize: 15.5, color: T.ink, marginBottom: 8 }}>
              {s.heading}
            </Text>
            {s.body.map((p, i) => (
              <Text
                key={i}
                style={{
                  fontFamily: F.regular,
                  fontSize: 14.5,
                  lineHeight: 22,
                  color: '#333',
                  marginBottom: i === s.body.length - 1 ? 0 : 10,
                }}
              >
                {p}
              </Text>
            ))}
          </View>
        ))}

        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
