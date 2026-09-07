import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PhotoCarousel } from '@/components/PhotoCarousel';
import { ReportForm } from '@/components/ReportForm';
import { SafetyCard } from '@/components/SafetyCard';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Sheet, SheetGrabber } from '@/components/Sheet';
import { ListingDetailSkeleton } from '@/components/Skeletons';
import { fetchSafetyReview, SafetyReview } from '@/lib/listings';
import { deleteWantedPost, fetchWantedOffersForPost, fetchWantedPost, reportWantedTarget, resolveWantedOffer, WantedOffer, WantedPostDetail } from '@/lib/wanted';
import { wantedActionState, wantedDetailCopy } from '@/lib/wantedPresentation';
import { F, T } from '@/lib/theme';
import { useUnread } from '@/lib/unread';
import { repostAvailability, repostWantedPost } from '@/lib/repost';

export default function WantedDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { refresh: refreshBadge } = useUnread();
  const [detail, setDetail] = useState<WantedPostDetail | null>(null);
  const [myOffer, setMyOffer] = useState<WantedOffer | null>(null);
  const [offerLookup, setOfferLookup] = useState<'loading' | 'ready' | 'error'>('loading');
  const [threadId, setThreadId] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [safety, setSafety] = useState<SafetyReview | null>(null);
  const [safetyLoading, setSafetyLoading] = useState(false);
  const [safetyError, setSafetyError] = useState(false);
  const [reposting, setReposting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const next = await fetchWantedPost(id);
      setDetail(next);
      setThreadId(next.thread_id ?? null);
      if (!next.management) {
        setOfferLookup('loading');
        try { const offers = next.participant_offer ? [next.participant_offer] : await fetchWantedOffersForPost(id); setMyOffer(offers.find((offer) => offer.role === 'seller') ?? null); setOfferLookup('ready'); }
        catch { setOfferLookup('error'); setError('Could not verify your existing offer. Retry before responding.'); }
        if (next.buyer?.id) {
          setSafetyLoading(true); setSafetyError(false);
          fetchSafetyReview(next.buyer.id, 'buyer').then((review) => { setSafety(review); setSafetyError(!review); }).catch(() => setSafetyError(true)).finally(() => setSafetyLoading(false));
        }
      }
      setState('ready');
    } catch { setState('error'); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  if (state === 'loading') return <View style={{ flex: 1 }}><ListingDetailSkeleton /><ScreenHeader floating /></View>;
  if (state === 'error' || !detail) return <View style={{ flex: 1 }}><ScreenHeader /><Center><Text style={muted}>Couldn’t load this request.</Text><Pressable accessibilityRole="button" onPress={load}><Text style={link}>Retry</Text></Pressable></Center></View>;

  const post = detail.wanted_post;
  const owner = !!detail.management;
  const copy = wantedDetailCopy(post);
  const action = !owner && offerLookup !== 'ready' ? { kind: 'disabled' as const, label: offerLookup === 'loading' ? 'Checking your offers…' : 'Offer actions unavailable' } : wantedActionState({ owner, postStatus: post.status, offerStatus: myOffer?.status, offerRole: myOffer?.role, threadId });
  const remove = async () => { try { await deleteWantedPost(post.id); router.replace('/(tabs)/wanted'); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not delete.'); } };
  const repost = repostAvailability(owner && post.status === 'active', post.created_at);
  const onRepost = async () => {
    setError(''); setReposting(true);
    try {
      const postedAt = await repostWantedPost(post.id);
      setDetail({ ...detail, wanted_post: { ...post, created_at: postedAt } });
      router.replace('/(tabs)/wanted');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not repost.'); }
    finally { setReposting(false); }
  };

  return <ScrollView contentContainerStyle={{ paddingBottom: 40 }} style={{ backgroundColor: T.bg }}>
    <View><PhotoCarousel photos={post.photo_urls} /><ScreenHeader floating /></View>
    <View style={{ padding: 20 }}>
      <Text style={{ fontFamily: F.extrabold, fontSize: 24, color: T.ink, letterSpacing: -0.6, lineHeight: 29 }}>{post.title}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
        <Text style={{ fontFamily: F.black, fontSize: 22, color: T.ink }}>{copy.budget}</Text>
        <View style={{ backgroundColor: T.fieldbg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}><Text style={{ fontFamily: F.semibold, fontSize: 12, color: T.muted }}>{copy.deadline}</Text></View>
      </View>

      <Text style={sectionLabel}>{copy.detailsLabel}</Text>
      <Text style={{ fontFamily: F.regular, fontSize: 15, color: '#333', lineHeight: 23 }}>{post.description}</Text>
      <Text style={{ fontFamily: F.medium, fontSize: 13, color: T.muted, marginTop: 8 }}>{copy.category}</Text>

      <Text style={sectionLabel}>{copy.locationLabel}</Text>
      <Text style={{ fontFamily: F.medium, fontSize: 15, color: T.ink }}>{post.location || 'USC · pickup'}</Text>

      {detail.buyer ? <><Text style={sectionLabel}>{copy.requesterLabel}</Text><Pressable accessibilityRole="button" accessibilityLabel="Open requester profile" onPress={() => router.push(`/u/${detail.buyer!.id}`)} style={profileCard}>{detail.buyer.avatar_url ? <Image source={{ uri: detail.buyer.avatar_url }} style={avatar} contentFit="cover" /> : <View style={[avatar, { backgroundColor: T.fieldbg, alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="person" size={20} color={T.muted} /></View>}<View style={{ flex: 1 }}><Text style={{ fontFamily: F.bold, fontSize: 15, color: T.ink }}>{detail.buyer.display_name || copy.profileFallback}</Text><Text style={{ fontFamily: F.regular, fontSize: 13, color: T.muted, marginTop: 1 }}>{detail.buyer.handle ? `@${detail.buyer.handle}` : copy.profileMetaFallback}</Text></View><Ionicons name="chevron-forward" size={18} color={T.muted} /></Pressable></> : null}
      {!owner ? <View style={{ marginTop: 12 }}><SafetyCard review={safety} loading={safetyLoading} />{safetyError && !safetyLoading ? <Text style={muted}>Safety review is unavailable right now.</Text> : null}</View> : null}
      {error ? <Text accessibilityRole="alert" style={{ color: T.cardinal, fontFamily: F.medium, marginTop: 12 }}>{error}</Text> : null}

      {action.kind === 'manage-post' ? <View style={{ marginTop: 24, gap: 10 }}><Pressable accessibilityRole="button" onPress={() => router.push(`/wanted/${post.id}/edit`)} style={primary}><Text style={primaryText}>Edit request</Text></Pressable><Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/requests?tab=wanted&direction=received')} style={secondary}><Text style={secondaryText}>Review offers ({post.offer_count})</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Repost request" accessibilityState={{ disabled: !repost.allowed || reposting }} disabled={!repost.allowed || reposting} onPress={onRepost} style={[secondary, { opacity: repost.allowed && !reposting ? 1 : 0.55 }]}><Text style={secondaryText}>{reposting ? 'Reposting…' : 'Repost request'}</Text></Pressable>{!repost.allowed && repost.availableAt ? <Text style={[muted, { textAlign: 'center' }]}>Available {new Date(repost.availableAt).toLocaleDateString()}</Text> : null}<Pressable accessibilityRole="button" onPress={() => setConfirm(true)} style={dangerButton}><Text style={{ fontFamily: F.bold, color: T.danger, fontSize: 15 }}>Delete request</Text></Pressable></View> : action.kind === 'open-chat' ? <Pressable accessibilityRole="button" accessibilityLabel="Open chat" onPress={() => router.push(`/messages/${action.threadId}`)} style={[primary, { marginTop: 24 }]}><Text style={primaryText}>Open chat</Text></Pressable> : action.kind === 'edit-offer' && myOffer ? <><Pressable accessibilityRole="button" onPress={() => router.push(`/wanted/${post.id}/offer?offerId=${myOffer.id}`)} style={[primary, { marginTop: 24 }]}><Text style={primaryText}>Edit offer</Text></Pressable><Pressable accessibilityRole="button" onPress={async () => { await resolveWantedOffer(myOffer.id, 'withdraw'); refreshBadge(); await load(); }} style={quietAction}><Text style={{ fontFamily: F.semibold, color: T.muted, fontSize: 13.5 }}>Withdraw offer</Text></Pressable></> : action.kind === 'make-offer' ? <Pressable accessibilityRole="button" onPress={() => router.push(`/wanted/${post.id}/offer${myOffer ? `?offerId=${myOffer.id}` : ''}`)} style={[primary, { marginTop: 24 }]}><Text style={primaryText}>{action.label}</Text></Pressable> : <View style={[secondary, { marginTop: 24 }]}><Text style={muted}>{action.label}</Text></View>}
      {!owner ? <Pressable onPress={() => setReportOpen(true)} hitSlop={8} style={quietAction}><Ionicons name="flag-outline" size={15} color={T.muted} /><Text style={{ fontFamily: F.semibold, fontSize: 13.5, color: T.muted }}>Report request</Text></Pressable> : null}
    </View>
    <Sheet visible={confirm} onClose={() => setConfirm(false)}><SheetGrabber /><Text style={{ fontFamily: F.extrabold, fontSize: 20, color: T.ink }}>Delete this request?</Text><Text style={[muted, { marginTop: 8 }]}>Pending offers will close. An accepted conversation stays available.</Text><Pressable accessibilityRole="button" onPress={remove} style={[primary, { marginTop: 24 }]}><Text style={primaryText}>Delete request</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Cancel deletion" onPress={() => setConfirm(false)} style={[secondary, { marginTop: 10 }]}><Text style={{ fontFamily: F.bold, color: T.ink }}>Keep request</Text></Pressable></Sheet>
    <Sheet visible={reportOpen} onClose={() => setReportOpen(false)}><SheetGrabber /><ReportForm title="Report Wanted request" submitting={reporting} onCancel={() => setReportOpen(false)} onSubmit={async (reason, note) => { setReporting(true); try { await reportWantedTarget({ wantedPostId: post.id }, reason, note); setReportOpen(false); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not submit report.'); } finally { setReporting(false); } }} /></Sheet>
  </ScrollView>;
}

function Center({ children }: { children: React.ReactNode }) { return <SafeAreaView style={{ flex: 1, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center', gap: 12 }}>{children}</SafeAreaView>; }
const muted = { fontFamily: F.medium, color: T.muted, fontSize: 13.5 } as const;
const link = { fontFamily: F.bold, color: T.cardinal, fontSize: 15 } as const;
const primary = { backgroundColor: T.cardinal, borderRadius: 14, paddingVertical: 16, alignItems: 'center' } as const;
const primaryText = { fontFamily: F.bold, color: '#fff', fontSize: 16 } as const;
const secondary = { backgroundColor: T.fieldbg, borderRadius: 14, paddingVertical: 15, alignItems: 'center' } as const;
const secondaryText = { fontFamily: F.bold, color: T.ink, fontSize: 15 } as const;
const dangerButton = { borderRadius: 14, borderWidth: 1, borderColor: T.danger, paddingVertical: 15, alignItems: 'center' } as const;
const quietAction = { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 22 } as const;
const sectionLabel = { fontFamily: F.bold, fontSize: 12, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 24, marginBottom: 8 } as const;
const profileCard = { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: T.rule, borderRadius: 14, padding: 12 } as const;
const avatar = { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: T.rule } as const;
