import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import type { WantedPost } from '@/lib/wanted';
import { wantedCardCopy } from '@/lib/wantedPresentation';
import { F, T } from '@/lib/theme';

export function WantedCard({ post, onPress }: { post: WantedPost; onPress: () => void }) {
  const copy = wantedCardCopy(post);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${post.title}, ${copy.budget}, posted ${new Date(post.created_at).toLocaleDateString()}`} onPress={onPress} style={{ flex: 1, maxWidth: '50%', margin: 6, marginBottom: 22 }}>
    <View style={{ aspectRatio: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: T.fieldbg }}>
      {post.photo_urls[0] ? <Image source={{ uri: post.photo_urls[0] }} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 7 }}><Ionicons name="search" size={22} color={T.muted} /><Text style={{ fontFamily: F.semibold, color: T.muted, fontSize: 11 }}>WANTED</Text></View>}
    </View>
    <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 15, marginTop: 11, color: T.ink }}>{post.title}</Text>
    <Text numberOfLines={1} style={{ fontFamily: F.regular, color: T.muted, fontSize: 12.5, marginTop: 5 }}>{post.location} · {copy.deadline}</Text>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 6 }}><Text style={{ fontFamily: F.bold, fontSize: 15.5, color: T.ink }}>{copy.budget}</Text><Text style={{ fontFamily: F.semibold, color: T.cardinal, fontSize: 11.5 }}>{post.status === 'active' ? copy.offers : post.status.toUpperCase()}</Text></View>
  </Pressable>;
}
