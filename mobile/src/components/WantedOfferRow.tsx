import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import type { WantedOffer } from '@/lib/wanted';
import { wantedOfferActions, wantedOfferStatusLabel } from '@/lib/wantedPresentation';
import { F, T } from '@/lib/theme';

export function WantedOfferRow({ offer, threadId, busy, onAccept, onDecline, onEdit, onWithdraw, onChat, onComplete, onRate, onReport }: { offer: WantedOffer; threadId?: string | null; busy?: boolean; onAccept?: () => void; onDecline?: () => void; onEdit?: () => void; onWithdraw?: () => void; onChat?: () => void; onComplete?: () => void; onRate?: () => void; onReport?: () => void }) {
  const post = offer.wanted_post;
  const actions = post ? wantedOfferActions({ role: offer.role, offerStatus: offer.status, postStatus: post.status, neededBy: post.needed_by, completedAt: offer.completed_at, threadId, canComplete: offer.transaction_actions?.can_complete, canRate: offer.transaction_actions?.can_rate }) : ['report'];
  return <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: T.rule, borderRadius: 16, padding: 14, marginBottom: 12 }}>
    <View style={{ flexDirection: 'row', gap: 12 }}>
      {offer.photo_urls[0] ? <Image source={{ uri: offer.photo_urls[0] }} style={{ width: 68, height: 68, borderRadius: 12 }} contentFit="cover" /> : <View style={{ width: 68, height: 68, borderRadius: 12, backgroundColor: T.fieldbg }} />}
      <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 16, color: T.ink }}>{offer.wanted_post?.title ?? 'Wanted offer'}</Text><Text style={{ fontFamily: F.extrabold, color: T.cardinal, marginTop: 3 }}>${offer.price.toLocaleString()}</Text><Text style={{ fontFamily: F.medium, color: T.muted, fontSize: 12.5, marginTop: 3 }}>{wantedOfferStatusLabel(offer.status)}</Text></View>
    </View>
    <Text numberOfLines={3} style={{ fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: T.ink, marginTop: 10 }}>{offer.message}</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
      {busy ? <ActivityIndicator color={T.cardinal} /> : <>{actions.includes('chat') && onChat ? <Action label="Open chat" primary onPress={onChat} /> : null}{actions.includes('accept') && onAccept ? <Action label="Accept & open chat" primary onPress={onAccept} /> : null}{actions.includes('decline') && onDecline ? <Action label="Decline" onPress={onDecline} /> : null}{actions.includes('edit') && onEdit ? <Action label="Edit" primary onPress={onEdit} /> : null}{actions.includes('withdraw') && onWithdraw ? <Action label="Withdraw" onPress={onWithdraw} /> : null}{actions.includes('complete') && onComplete ? <Action label="Mark complete" onPress={onComplete} /> : null}{actions.includes('rate') && onRate ? <Action label="Rate" onPress={onRate} /> : null}{actions.includes('report') && onReport ? <Action label="Report" onPress={onReport} /> : null}</>}
    </View>
  </View>;
}

function Action({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ minWidth: '45%', flexGrow: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 11, backgroundColor: primary ? T.cardinal : '#fff', borderWidth: primary ? 0 : 1, borderColor: T.rule }}><Text style={{ fontFamily: F.bold, fontSize: 12.5, color: primary ? '#fff' : T.ink }}>{label}</Text></Pressable>;
}
