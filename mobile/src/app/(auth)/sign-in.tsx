import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { T, F } from '@/lib/theme';

// Small product-showcase cards, mirroring the marketing hero.
const SHOWCASE = [
  { price: '$90', label: 'IKEA Markus chair', uri: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=300' },
  { price: '$12', label: 'Sourdough loaves', uri: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=300' },
  { price: '$7', label: 'Matcha drinks', uri: 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=300' },
];

function MiniCard({ item, style }: { item: (typeof SHOWCASE)[number]; style?: object }) {
  return (
    <View
      style={[
        {
          backgroundColor: '#fff',
          borderRadius: 16,
          width: 150,
          overflow: 'hidden',
          shadowColor: '#000',
          shadowOpacity: 0.12,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
          elevation: 8,
        },
        style,
      ]}
    >
      <Image source={{ uri: item.uri }} style={{ width: '100%', height: 96 }} contentFit="cover" />
      <View style={{ paddingVertical: 12, alignItems: 'center' }}>
        <Text style={{ fontFamily: F.bold, fontSize: 15, color: T.ink }}>{item.price}</Text>
        <Text style={{ fontFamily: F.regular, fontSize: 12, color: T.muted, marginTop: 2 }}>{item.label}</Text>
      </View>
    </View>
  );
}

export default function SignIn() {
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: T.bg, paddingHorizontal: 24, justifyContent: 'center' }}>
      {/* Eyebrow */}
      <Text
        style={{
          fontFamily: F.bold,
          fontSize: 14,
          color: T.cardinal,
          textAlign: 'center',
          letterSpacing: 0.2,
          marginBottom: 12,
        }}
      >
        The marketplace for USC.
      </Text>

      {/* Headline */}
      <Text
        style={{
          fontFamily: F.black,
          fontSize: 46,
          lineHeight: 46,
          color: T.ink,
          textAlign: 'center',
          letterSpacing: -1.8,
        }}
      >
        Buy from people who show up.
      </Text>

      {/* Subtitle */}
      <Text
        style={{
          fontFamily: F.regular,
          fontSize: 15,
          lineHeight: 21,
          color: T.muted,
          textAlign: 'center',
          marginTop: 16,
        }}
      >
        Every buyer and seller verified with @usc.edu. No scams, no strangers, no ghosting.
      </Text>

      {/* CTA */}
      <Pressable
        onPress={() => router.push('/(auth)/email')}
        style={{
          backgroundColor: T.cardinal,
          borderRadius: 14,
          paddingVertical: 17,
          alignItems: 'center',
          marginTop: 28,
          alignSelf: 'center',
          paddingHorizontal: 48,
        }}
      >
        <Text style={{ fontFamily: F.bold, color: '#fff', fontSize: 16 }}>Get started</Text>
      </Pressable>

      {/* Floating product showcase */}
      <View style={{ height: 210, marginTop: 40, alignItems: 'center', justifyContent: 'center' }}>
        <MiniCard item={SHOWCASE[0]} style={{ position: 'absolute', left: 2, top: 40, transform: [{ rotate: '-6deg' }] }} />
        <MiniCard item={SHOWCASE[2]} style={{ position: 'absolute', right: 2, top: 40, transform: [{ rotate: '6deg' }] }} />
        <MiniCard item={SHOWCASE[1]} style={{ zIndex: 2 }} />
      </View>
    </View>
  );
}
