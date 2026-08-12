import { ReactNode } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { T, F, S } from '@/lib/theme';
import type { LegalDoc } from '@/lib/legal';

// Shared shell for the static content screens (Terms, Privacy, Support).
// Renders a LegalDoc from @/lib/legal so all three read identically and only
// the copy differs. Back comes from ScreenHeader, which pops the stack.
export function LegalScreen({ doc, children }: { doc: LegalDoc; children?: ReactNode }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
      <ScreenHeader />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: S.gutter,
          paddingBottom: 48,
        }}
      >
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
