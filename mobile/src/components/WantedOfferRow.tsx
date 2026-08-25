import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import type { WantedOffer } from '@/lib/wanted';
import { wantedOfferStatusLabel } from '@/lib/wantedPresentation';
import { F, T } from '@/lib/theme';

export function WantedOfferRow({ offer, busy, onAccept, onDecline, onEdit, onWithdraw, onChat }: { offer: WantedOffer; busy?: boolean; onAccept?: () => void; onDecline?: () => void; onEdit?: () => void; onWithdraw?: () => void; onChat?: () => void }) {
  return <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: T.rule, borderRadius: 16, padding: 14, marginBottom: 12 }}>
    <View style={{ flexDirection: 'row', gap: 12 }}>
      {offer.photo_urls[0] ? <Image source={{ uri: offer.photo_urls[0] }} style={{ width: 68, height: 68, borderRadius: 12 }} contentFit="cover" /> : <View style={{ width: 68, height: 68, borderRadius: 12, backgroundColor: T.fieldbg }} />}
      <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 16, color: T.ink }}>{offer.wanted_post?.title ?? 'Wanted offer'}</Text><Text style={{ fontFamily: F.extrabold, color: T.cardinal, marginTop: 3 }}>${offer.price.toLocaleString()}</Text><Text style={{ fontFamily: F.medium, color: T.muted, fontSize: 12.5, marginTop: 3 }}>{wantedOfferStatusLabel(offer.status)}</Text></View>
    </View>
    <Text numberOfLines={3} style={{ fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: T.ink, marginTop: 10 }}>{offer.message}</Text>
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
      {busy ? <ActivityIndicator color={T.cardinal} /> : <>{onChat ? <Action label="Open chat" primary onPress={onChat} /> : null}{onAccept ? <Action label="Accept & open chat" primary onPress={onAccept} /> : null}{onDecline ? <Action label="Decline" onPress={onDecline} /> : null}{onEdit ? <Action label="Edit" primary onPress={onEdit} /> : null}{onWithdraw ? <Action label="Withdraw" onPress={onWithdraw} /> : null}</>}
    </View>
  </View>;
}

function Action({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 11, backgroundColor: primary ? T.cardinal : '#fff', borderWidth: primary ? 0 : 1, borderColor: T.rule }}><Text style={{ fontFamily: F.bold, fontSize: 12.5, color: primary ? '#fff' : T.ink }}>{label}</Text></Pressable>;
}
