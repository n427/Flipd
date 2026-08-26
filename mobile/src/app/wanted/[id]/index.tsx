import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ReportForm } from '@/components/ReportForm';
import { SafetyCard } from '@/components/SafetyCard';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Sheet, SheetGrabber } from '@/components/Sheet';
import { fetchSafetyReview, SafetyReview } from '@/lib/listings';
import { deleteWantedPost, fetchWantedOffersForPost, fetchWantedPost, reportWantedTarget, resolveWantedOffer, WantedOffer, WantedPostDetail } from '@/lib/wanted';
import { wantedActionState, wantedCardCopy } from '@/lib/wantedPresentation';
import { F, S, T } from '@/lib/theme';
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

  if (state === 'loading') return <Center><ActivityIndicator color={T.cardinal} /></Center>;
  if (state === 'error' || !detail) return <Center><Text style={muted}>Couldn’t load this request.</Text><Pressable accessibilityRole="button" onPress={load}><Text style={link}>Retry</Text></Pressable></Center>;

  const post = detail.wanted_post;
  const owner = !!detail.management;
  const copy = wantedCardCopy(post);
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

  return <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
    <ScreenHeader right={owner && post.status === 'active' ? <Pressable accessibilityRole="button" accessibilityLabel="Edit request" onPress={() => router.push(`/wanted/${post.id}/edit`)}><Text style={link}>Edit</Text></Pressable> : !owner ? <Pressable accessibilityRole="button" accessibilityLabel="Report Wanted request" onPress={() => setReportOpen(true)}><Ionicons name="flag-outline" size={20} color={T.muted} /></Pressable> : undefined} />
    <ScrollView contentContainerStyle={{ padding: S.gutter, paddingBottom: 100 }}>
      {post.photo_urls.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -S.gutter }} contentContainerStyle={{ gap: 8, paddingHorizontal: S.gutter }}>{post.photo_urls.map((uri) => <Image key={uri} source={{ uri }} style={{ width: 270, height: 220, borderRadius: 18 }} contentFit="cover" />)}</ScrollView> : null}
      <Text style={{ fontFamily: F.black, fontSize: 28, color: T.ink, marginTop: 22 }}>{post.title}</Text>
      <Text style={{ fontFamily: F.extrabold, fontSize: 18, color: T.cardinal, marginTop: 7 }}>{copy.budget}</Text>
      <Text style={{ fontFamily: F.medium, color: T.muted, marginTop: 6 }}>{post.category} · {post.location} · {copy.deadline}</Text>
      <Text style={{ fontFamily: F.regular, fontSize: 16, lineHeight: 24, color: T.ink, marginTop: 22 }}>{post.description}</Text>
      {detail.buyer ? <View style={{ marginTop: 24, padding: 14, borderWidth: 1, borderColor: T.rule, borderRadius: 14 }}><Text style={{ fontFamily: F.bold, color: T.ink }}>Requested by {detail.buyer.display_name ?? detail.buyer.handle ?? 'a Flipd member'}</Text><Text style={muted}>Public profile and campus identity</Text></View> : null}
      {!owner ? <View style={{ marginTop: 12 }}><SafetyCard review={safety} loading={safetyLoading} />{safetyError && !safetyLoading ? <Text style={muted}>Safety review is unavailable right now.</Text> : null}</View> : null}
      {error ? <Text accessibilityRole="alert" style={{ color: T.cardinal, fontFamily: F.medium, marginTop: 12 }}>{error}</Text> : null}
      {action.kind === 'manage-post' ? <><Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/requests?tab=wanted&direction=received')} style={primary}><Text style={primaryText}>Review offers ({post.offer_count})</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Repost request" accessibilityState={{ disabled: !repost.allowed || reposting }} disabled={!repost.allowed || reposting} onPress={onRepost} style={[secondary, { opacity: repost.allowed && !reposting ? 1 : 0.55 }]}><Text style={{ fontFamily: F.bold, color: T.ink }}>{reposting ? 'Reposting…' : 'Repost request'}</Text></Pressable>{!repost.allowed && repost.availableAt ? <Text style={[muted, { textAlign: 'center', marginTop: 6 }]}>Available {new Date(repost.availableAt).toLocaleDateString()}</Text> : null}<Pressable accessibilityRole="button" onPress={() => setConfirm(true)} style={secondary}><Text style={{ fontFamily: F.bold, color: T.cardinal }}>Delete request</Text></Pressable></> : action.kind === 'open-chat' ? <Pressable accessibilityRole="button" accessibilityLabel="Open chat" onPress={() => router.push(`/messages/${action.threadId}`)} style={primary}><Text style={primaryText}>Open chat</Text></Pressable> : action.kind === 'edit-offer' && myOffer ? <><Pressable accessibilityRole="button" onPress={() => router.push(`/wanted/${post.id}/offer?offerId=${myOffer.id}`)} style={primary}><Text style={primaryText}>Edit offer</Text></Pressable><Pressable accessibilityRole="button" onPress={async () => { await resolveWantedOffer(myOffer.id, 'withdraw'); refreshBadge(); await load(); }} style={secondary}><Text style={{ fontFamily: F.bold, color: T.cardinal }}>Withdraw offer</Text></Pressable></> : action.kind === 'make-offer' ? <Pressable accessibilityRole="button" onPress={() => router.push(`/wanted/${post.id}/offer${myOffer ? `?offerId=${myOffer.id}` : ''}`)} style={primary}><Text style={primaryText}>{action.label}</Text></Pressable> : <View style={secondary}><Text style={muted}>{action.label}</Text></View>}
    </ScrollView>
    <Sheet visible={confirm} onClose={() => setConfirm(false)}><SheetGrabber /><Text style={{ fontFamily: F.extrabold, fontSize: 20, color: T.ink }}>Delete this request?</Text><Text style={[muted, { marginTop: 8 }]}>Pending offers will close. An accepted conversation stays available.</Text><Pressable accessibilityRole="button" onPress={remove} style={primary}><Text style={primaryText}>Delete request</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Cancel deletion" onPress={() => setConfirm(false)} style={secondary}><Text style={{ fontFamily: F.bold, color: T.ink }}>Keep request</Text></Pressable></Sheet>
    <Sheet visible={reportOpen} onClose={() => setReportOpen(false)}><SheetGrabber /><ReportForm title="Report Wanted request" submitting={reporting} onCancel={() => setReportOpen(false)} onSubmit={async (reason, note) => { setReporting(true); try { await reportWantedTarget({ wantedPostId: post.id }, reason, note); setReportOpen(false); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not submit report.'); } finally { setReporting(false); } }} /></Sheet>
  </SafeAreaView>;
}

function Center({ children }: { children: React.ReactNode }) { return <SafeAreaView style={{ flex: 1, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center', gap: 12 }}>{children}</SafeAreaView>; }
const muted = { fontFamily: F.medium, color: T.muted, fontSize: 13.5 } as const;
const link = { fontFamily: F.bold, color: T.cardinal, fontSize: 15 } as const;
const primary = { backgroundColor: T.cardinal, borderRadius: 13, paddingVertical: 14, alignItems: 'center', marginTop: 24 } as const;
const primaryText = { fontFamily: F.bold, color: '#fff' } as const;
const secondary = { borderWidth: 1, borderColor: T.rule, borderRadius: 13, paddingVertical: 13, alignItems: 'center', marginTop: 10 } as const;
