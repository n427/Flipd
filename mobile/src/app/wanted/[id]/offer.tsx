import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Field } from '@/components/Field';
import { FormScroll } from '@/components/FormScroll';
import { cleanupWantedPhotos, createWantedOffer, fetchWantedOffersForPost, fetchWantedPost, updateWantedOffer, uploadWantedPhotos, WantedOffer } from '@/lib/wanted';
import { wantedOfferEntryState, wantedOfferMutationId } from '@/lib/wantedPresentation';
import { useUnread } from '@/lib/unread';
import { F, T } from '@/lib/theme';
import { isCurrentWantedOfferLoad } from '@/lib/wantedRequestState';

export default function WantedOfferScreen() {
  const { id, offerId } = useLocalSearchParams<{ id: string; offerId?: string }>();
  const router = useRouter();
  const { refresh: refreshBadge } = useUnread();
  const generatedNewOfferUuid = useRef(globalThis.crypto.randomUUID()).current;
  const offerUuid = wantedOfferMutationId(offerId, generatedNewOfferUuid);
  const routeModeKey = offerId ?? 'new';
  const currentRouteModeKey = useRef(routeModeKey);
  currentRouteModeKey.current = routeModeKey;
  const offerLoadGeneration = useRef(0);
  const { width } = useWindowDimensions();
  const tile = (width - 60) / 3;
  const [initial, setInitial] = useState<WantedOffer | null>(null);
  const [initialState, setInitialState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [validatedModeKey, setValidatedModeKey] = useState<string | null>(null);
  const [redirectOffer, setRedirectOffer] = useState<{ id: string; label: string } | null>(null);
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [retained, setRetained] = useState<{ path: string; url: string }[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    const generation = ++offerLoadGeneration.current;
    const requestIdentity = { key: routeModeKey, generation };
    let cancelled = false;
    const isCurrent = () => isCurrentWantedOfferLoad(
      { key: currentRouteModeKey.current, generation: offerLoadGeneration.current }, requestIdentity, cancelled,
    );
    setInitialState('loading');
    setValidatedModeKey(null);
    setBusy(false);
    setInitial(null); setPrice(''); setDescription(''); setMessage(''); setPhotos([]); setRetained([]);
    setError(''); setRedirectOffer(null);
    Promise.all([fetchWantedPost(id), fetchWantedOffersForPost(id)]).then(([detail, rows]) => {
      if (!isCurrent()) return;
      const requested = offerId ? rows.find((row) => row.id === offerId) : undefined;
      const existing = requested ?? rows.find((row) => row.role === 'seller') ?? rows[0];
      const entry = wantedOfferEntryState({ owner: Boolean(detail.management), postStatus: detail.wanted_post.status, requestedId: offerId, existing });
      if (entry.kind === 'blocked') { setError(entry.message); setInitialState('error'); return; }
      if (entry.kind === 'redirect') { setRedirectOffer({ id: entry.offerId, label: entry.label }); setError('Use your existing offer record to continue.'); setInitialState('error'); return; }
      if (entry.kind === 'edit' || entry.kind === 'resubmit') {
        if (!existing) { setError('This offer is unavailable or you do not have access.'); setInitialState('error'); return; }
        setInitial(existing); setPrice(String(existing.price)); setDescription(existing.description); setMessage(existing.message);
        setRetained(existing.photo_paths.map((path, index) => ({ path, url: existing.photo_urls[index] })));
      }
      setValidatedModeKey(routeModeKey); setInitialState('ready');
    }).catch(() => { if (!isCurrent()) return; setError('Could not verify this request and your offers.'); setInitialState('error'); });
    return () => {
      cancelled = true;
    };
  }, [id, offerId, routeModeKey]);

  const pick = async () => {
    const pickModeKey = routeModeKey;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (currentRouteModeKey.current !== pickModeKey) return;
    if (!permission.granted) return Alert.alert('Permission needed', 'Allow photo access to show what you are offering.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: .8, allowsEditing: true, aspect: [1, 1] });
    if (currentRouteModeKey.current === pickModeKey && !result.canceled) setPhotos((all) => [...all, result.assets[0].uri].slice(0, 6 - retained.length));
  };

  const submit = async () => {
    if (initialState !== 'ready' || validatedModeKey !== routeModeKey) return;
    const submitModeKey = routeModeKey;
    const submitOfferUuid = offerUuid;
    const submitInitial = initial;
    const isSubmitCurrent = () => currentRouteModeKey.current === submitModeKey;
    const amount = Number(price);
    if (!Number.isSafeInteger(amount) || amount <= 0 || !description.trim() || !message.trim() || retained.length + photos.length < 1) { setError('Add at least one photo, a whole-dollar price, description, and message.'); return; }
    setBusy(true); setError('');
    let upload: { paths: string[] } | null = null;
    try {
      if (photos.length) upload = await uploadWantedPhotos(photos.map((uri, index) => ({ uri, name: `offer-${Date.now()}-${index}.jpg`, type: 'image/jpeg' })), 'offer', submitOfferUuid);
      if (!isSubmitCurrent()) {
        if (upload?.paths.length) await cleanupWantedPhotos(upload.paths, 'offer').catch(() => {});
        return;
      }
      const photoPaths = [...retained.map((item) => item.path), ...(upload?.paths ?? [])];
      const saved = submitInitial?.status === 'pending'
        ? await updateWantedOffer(submitInitial.id, { price: amount, description, message, photo_paths: photoPaths })
        : await createWantedOffer(id, { id: submitOfferUuid, price: amount, description, message, photo_paths: photoPaths });
      const superseded = (submitInitial?.photo_paths ?? []).filter((path) => !saved.photo_paths.includes(path));
      if (superseded.length) await cleanupWantedPhotos(superseded, 'offer').catch(() => {});
      if (!isSubmitCurrent()) return;
      refreshBadge();
      router.replace('/(tabs)/requests?tab=wanted&direction=sent');
    } catch (cause) {
      if (upload?.paths.length) await cleanupWantedPhotos(upload.paths, 'offer').catch(() => {});
      if (!isSubmitCurrent()) return;
      setError(cause instanceof Error ? cause.message : 'Could not save your offer.');
      setBusy(false);
    }
  };

  return <View style={{ flex: 1, backgroundColor: T.bg }}>
    <SafeAreaView edges={['top']}><View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: T.rule }}><Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()}><Ionicons name="close" size={22} color={T.muted} /></Pressable><Text style={{ fontFamily: F.bold, fontSize: 17, color: T.ink, marginLeft: 14 }}>{initial?.status === 'pending' ? 'Edit offer' : initial ? 'Send another offer' : 'Make an offer'}</Text></View></SafeAreaView>
    <FormScroll contentContainerStyle={{ padding: 22, paddingBottom: 80 }}>
      <Text style={label}>Photos <Text style={{ color: T.muted }}>(required, up to 6)</Text></Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{retained.map((item) => <Photo key={item.path} uri={item.url} size={tile} remove={() => setRetained((all) => all.filter((row) => row.path !== item.path))} />)}{photos.map((uri) => <Photo key={uri} uri={uri} size={tile} remove={() => setPhotos((all) => all.filter((row) => row !== uri))} />)}{retained.length + photos.length < 6 ? <Pressable accessibilityRole="button" accessibilityLabel="Add offer photo" onPress={pick} style={{ width: tile, height: tile, borderRadius: 14, backgroundColor: T.fieldbg, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="camera-outline" size={25} color={T.cardinal} /></Pressable> : null}</View>
      <Text style={label}>Your price ($)</Text><Field value={price} onChangeText={setPrice} keyboardType="number-pad" placeholder="75" style={input} />
      <Text style={label}>Condition or description</Text><Field value={description} onChangeText={setDescription} multiline maxLength={2000} placeholder="Describe the item or service clearly." style={[input, { height: 112, paddingTop: 13 }]} />
      <Text style={label}>Message to the buyer</Text><Field value={message} onChangeText={setMessage} multiline maxLength={1000} placeholder="Why is this a good match?" style={[input, { height: 100, paddingTop: 13 }]} />
      {initialState === 'loading' ? <Text style={{ fontFamily: F.medium, color: T.muted, marginTop: 14 }}>Loading your offer…</Text> : null}
      {error ? <Text accessibilityRole="alert" style={{ fontFamily: F.medium, color: T.cardinal, marginTop: 14 }}>{error}</Text> : null}
      {redirectOffer ? <Pressable accessibilityRole="button" accessibilityLabel={redirectOffer.label} onPress={() => router.replace(`/wanted/${id}/offer?offerId=${redirectOffer.id}`)} style={{ borderWidth: 1, borderColor: T.rule, borderRadius: 13, paddingVertical: 14, alignItems: 'center', marginTop: 14 }}><Text style={{ fontFamily: F.bold, color: T.ink }}>{redirectOffer.label}</Text></Pressable> : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Save Wanted offer" accessibilityState={{ disabled: busy || initialState !== 'ready' || validatedModeKey !== routeModeKey, busy }} disabled={busy || initialState !== 'ready' || validatedModeKey !== routeModeKey} onPress={submit} style={{ backgroundColor: T.cardinal, borderRadius: 13, paddingVertical: 14, alignItems: 'center', marginTop: 22, opacity: busy || initialState !== 'ready' || validatedModeKey !== routeModeKey ? .5 : 1 }}><Text style={{ fontFamily: F.bold, color: '#fff' }}>{busy ? 'Saving…' : initial?.status === 'pending' ? 'Save offer' : 'Send private offer'}</Text></Pressable>
    </FormScroll>
  </View>;
}

function Photo({ uri, size, remove }: { uri: string; size: number; remove: () => void }) { return <View><Image source={{ uri }} style={{ width: size, height: size, borderRadius: 14 }} contentFit="cover" /><Pressable accessibilityRole="button" accessibilityLabel="Remove photo" onPress={remove} style={{ position: 'absolute', right: -4, top: -4, backgroundColor: T.ink, borderRadius: 12, padding: 3 }}><Ionicons name="close" size={14} color="#fff" /></Pressable></View>; }
const label = { fontFamily: F.bold, fontSize: 13.5, color: T.ink, marginTop: 20, marginBottom: 8 } as const;
const input = { height: 50, borderRadius: 13, backgroundColor: T.fieldbg, paddingHorizontal: 14, fontFamily: F.medium, fontSize: 15, color: T.ink } as const;
