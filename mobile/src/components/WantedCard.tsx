import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import type { WantedPost } from '@/lib/wanted';
import { wantedCardCopy } from '@/lib/wantedPresentation';
import { F, T } from '@/lib/theme';

export function WantedCard({ post, onPress }: { post: WantedPost; onPress: () => void }) {
  const copy = wantedCardCopy(post);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${post.title}, ${copy.budget}`} onPress={onPress} style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: T.rule, borderRadius: 18, overflow: 'hidden', marginBottom: 14 }}>
    {post.photo_urls[0] ? <Image source={{ uri: post.photo_urls[0] }} style={{ width: '100%', height: 174 }} contentFit="cover" /> : null}
    <View style={{ padding: 16, gap: 7 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <Text numberOfLines={2} style={{ flex: 1, fontFamily: F.extrabold, fontSize: 18, color: T.ink }}>{post.title}</Text>
        <Text style={{ fontFamily: F.bold, fontSize: 14, color: T.cardinal }}>{copy.budget}</Text>
      </View>
      <Text style={{ fontFamily: F.medium, color: T.muted, fontSize: 13 }}>{post.category[0].toUpperCase() + post.category.slice(1)} · {post.location}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Ionicons name="time-outline" size={14} color={T.muted} /><Text style={{ fontFamily: F.medium, color: T.muted, fontSize: 12.5 }}>{copy.deadline} · {copy.offers}</Text></View>
      {post.status !== 'active' ? <Text style={{ fontFamily: F.bold, color: T.cardinal, fontSize: 12 }}>{post.status.toUpperCase()}</Text> : null}
    </View>
  </Pressable>;
}
