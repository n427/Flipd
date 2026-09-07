import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FormScroll } from '@/components/FormScroll';
import { CAMPUS_SPOTS } from '@/lib/catalog';
import { createWantedPost, fetchWantedPost, cleanupWantedPhotos, updateWantedPost, uploadWantedPhotos, WantedCategory, WantedPost } from '@/lib/wanted';
import { losAngelesEndOfDayUtc, referencePhotoPath, wantedDateInput, wantedFormState } from '@/lib/wantedPresentation';
import { F, S, T } from '@/lib/theme';
import { PlaceHit, searchPlaces } from '@/lib/places';
import { useSession } from '@/lib/session';

const MAX_PHOTOS = 6;
const MAX_TITLE = 60;
const PAGE_PAD = 20;
const GRID_GAP = 10;
const CHIP_FG = '#43464C';
const CATEGORIES: { id: WantedCategory; label: string }[] = [
  { id: 'goods', label: 'Goods' },
  { id: 'services', label: 'Services' },
  { id: 'housing', label: 'Housing' },
];

export default function NewWantedPost() { return <WantedPostFormScreen />; }

export function WantedPostFormScreen({ initialId }: { initialId?: string }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const tile = (width - PAGE_PAD * 2 - GRID_GAP * 2) / 3;
  const { user } = useSession();
  const placeGeneration = useRef(0);
  const [initial, setInitial] = useState<WantedPost | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<WantedCategory | null>(null);
  const [budget, setBudget] = useState('');
  const [location, setLocation] = useState('');
  const [placeHits, setPlaceHits] = useState<PlaceHit[]>([]);
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [existing, setExisting] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);

  useEffect(() => {
    if (!initialId) return;
    fetchWantedPost(initialId).then(({ wanted_post }) => {
      setInitial(wanted_post);
      setTitle(wanted_post.title);
      setCategory(wanted_post.category);
      setBudget(String(wanted_post.max_budget));
      setLocation(wanted_post.location);
      setDescription(wanted_post.description);
      setDate(wantedDateInput(wanted_post.needed_by));
      setExisting(wanted_post.photo_urls);
    }).catch(() => setError('Could not load this request.'));
  }, [initialId]);

  const pickPhoto = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return Alert.alert('Permission needed', 'Allow photo access to add reference photos.');
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect: [1, 1] });
      if (!result.canceled) setPhotos((all) => [...all, result.assets[0].uri].slice(0, MAX_PHOTOS - existing.length));
    } catch { Alert.alert('Couldn’t open photos', 'Try again.'); }
  };
  const takePhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return Alert.alert('Permission needed', 'Allow camera access to take a reference photo.');
      const result = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: true, aspect: [1, 1] });
      if (!result.canceled) setPhotos((all) => [...all, result.assets[0].uri].slice(0, MAX_PHOTOS - existing.length));
    } catch { Alert.alert('Couldn’t open camera', 'Try again.'); }
  };

  const onLocationChange = async (value: string) => {
    setLocation(value);
    const generation = ++placeGeneration.current;
    if (value.trim().length < 3) { setPlaceHits([]); return; }
    const hits = await searchPlaces(value);
    if (generation === placeGeneration.current) setPlaceHits(hits);
  };
  const chooseLocation = (value: string) => {
    ++placeGeneration.current;
    setLocation(value);
    setPlaceHits([]);
  };

  const form = wantedFormState({ photoCount: existing.length + photos.length, title, category: category ?? '', budget, location, description, date });
  const submit = async () => {
    const amount = Number(budget);
    const neededBy = losAngelesEndOfDayUtc(date);
    if (!form.ready || !category || !neededBy || new Date(neededBy) <= new Date()) {
      setError(!neededBy || (neededBy && new Date(neededBy) <= new Date()) ? 'Add a future needed-by date.' : form.hint ?? 'Check the required fields.');
      return;
    }
    setBusy(true);
    setError('');
    let uploaded: { paths: string[]; urls?: string[] } | null = null;
    try {
      if (photos.length) uploaded = await uploadWantedPhotos(photos.map((uri, i) => ({ uri, name: `wanted-${Date.now()}-${i}.jpg`, type: 'image/jpeg' })), 'reference');
      const input = { title: title.trim(), category, max_budget: amount, location: location.trim(), description: description.trim(), needed_by: neededBy, photo_urls: [...existing, ...(uploaded?.urls ?? [])] };
      const saved = initialId ? await updateWantedPost(initialId, input) : await createWantedPost(input);
      const removedPaths = (initial?.photo_urls ?? []).filter((url) => !saved.photo_urls.includes(url)).map((url) => user ? referencePhotoPath(url, user.id) : null).filter((path): path is string => !!path);
      if (removedPaths.length) await cleanupWantedPhotos(removedPaths, 'reference').catch(() => {});
      router.replace(`/wanted/${saved.id}`);
    } catch (cause) {
      if (uploaded?.paths.length) await cleanupWantedPhotos(uploaded.paths, 'reference').catch(() => {});
      setError(cause instanceof Error ? cause.message : 'Could not save your request.');
      setBusy(false);
    }
  };

  const photoCount = existing.length + photos.length;
  return <View style={{ flex: 1, backgroundColor: T.bg }}>
    <SafeAreaView edges={['top']} style={{ backgroundColor: T.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: PAGE_PAD, paddingTop: 8, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: T.rule }}>
        <Pressable accessibilityLabel="Go back" hitSlop={10} onPress={() => router.back()}><Ionicons name="close" size={22} color={T.muted} /></Pressable>
        <Text style={{ flex: 1, fontFamily: F.bold, fontSize: 17, color: T.ink, letterSpacing: -0.34 }}>{initial ? 'Edit request' : 'New Wanted request'}</Text>
        <Text style={{ fontFamily: F.semibold, fontSize: 12.5, color: T.muted }}>{form.steps}/4</Text>
      </View>
    </SafeAreaView>

    <FormScroll contentContainerStyle={{ paddingHorizontal: PAGE_PAD, paddingTop: S.screenTop, paddingBottom: S.screenBottom }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <Text style={label}>Photos</Text>
        <Text style={{ fontFamily: F.medium, fontSize: 12, color: T.muted }}>Up to {MAX_PHOTOS} · first is the cover</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP, marginBottom: 22 }}>
        {existing.map((uri, index) => <Photo key={uri} uri={uri} size={tile} cover={index === 0} onRemove={() => setExisting((all) => all.filter((item) => item !== uri))} />)}
        {photos.map((uri, index) => <Photo key={uri} uri={uri} size={tile} cover={existing.length + index === 0} onRemove={() => setPhotos((all) => all.filter((item) => item !== uri))} />)}
        {photoCount < MAX_PHOTOS ? <>
          <Pressable accessibilityLabel="Add reference photo from library" onPress={pickPhoto} style={[photoBox, { width: tile, height: tile }]}><Ionicons name="images-outline" size={21} color={T.muted} /><Text style={photoBoxLabel}>Library</Text></Pressable>
          <Pressable accessibilityLabel="Take a reference photo" onPress={takePhoto} style={[photoBox, { width: tile, height: tile }]}><Ionicons name="camera-outline" size={21} color={T.muted} /><Text style={photoBoxLabel}>Camera</Text></Pressable>
          {photoCount === 0 ? <View style={[photoBox, { width: tile, height: tile, backgroundColor: '#FAFAFB' }]}><Text style={{ fontFamily: F.medium, fontSize: 11.5, color: '#B6B8BD', textAlign: 'center', lineHeight: 15 }}>Add{`\n`}more</Text></View> : null}
        </> : null}
      </View>

      <Text style={label}>Title</Text>
      <TextInput value={title} onChangeText={(value) => setTitle(value.slice(0, MAX_TITLE))} onFocus={() => setFocused('title')} onBlur={() => setFocused(null)} placeholder="What are you looking for?" placeholderTextColor={T.muted} maxLength={MAX_TITLE} style={[field, focused === 'title' && fieldFocus, { marginBottom: 6 }]} />
      <Text style={{ fontFamily: F.medium, fontSize: 11.5, color: T.muted, textAlign: 'right', marginBottom: 18 }}>{title.length}/{MAX_TITLE}</Text>

      <Text style={label}>Category</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -PAGE_PAD, marginBottom: 22 }} contentContainerStyle={{ gap: 7, paddingHorizontal: PAGE_PAD }}>
        {CATEGORIES.map((item) => <Pressable accessibilityRole="radio" accessibilityState={{ selected: category === item.id }} key={item.id} onPress={() => setCategory(category === item.id ? null : item.id)} style={chip(category === item.id)}><Text style={{ fontFamily: F.semibold, fontSize: 13.5, color: category === item.id ? '#fff' : CHIP_FG }}>{item.label}</Text></Pressable>)}
      </ScrollView>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}><Text style={[label, { marginBottom: 0 }]}>Maximum budget</Text><Text style={{ fontFamily: F.medium, fontSize: 12, color: T.muted }}>Whole dollars</Text></View>
      <View style={{ justifyContent: 'center', marginBottom: 22 }}><Text style={{ position: 'absolute', left: 16, zIndex: 1, fontFamily: F.bold, fontSize: 16, color: T.muted }}>$</Text><TextInput value={budget} onChangeText={(value) => setBudget(value.replace(/\D/g, ''))} onFocus={() => setFocused('budget')} onBlur={() => setFocused(null)} placeholder="0" placeholderTextColor={T.muted} keyboardType="number-pad" style={[field, focused === 'budget' && fieldFocus, { marginBottom: 0, paddingLeft: 34, fontFamily: F.semibold }]} /></View>

      <Text style={label}>Description</Text>
      <TextInput value={description} onChangeText={setDescription} onFocus={() => setFocused('description')} onBlur={() => setFocused(null)} multiline maxLength={2000} placeholder="Size, condition, timing, or anything else sellers should know." placeholderTextColor={T.muted} style={[field, focused === 'description' && fieldFocus, { height: 104, textAlignVertical: 'top', paddingTop: 14, paddingBottom: 14, fontSize: 15, lineHeight: 21, marginBottom: 22 }]} />

      <Text style={label}>Where you’ll meet</Text>
      <View style={{ justifyContent: 'center' }}><Ionicons name="location-outline" size={17} color={T.muted} style={{ position: 'absolute', left: 15, zIndex: 1 }} /><TextInput value={location} onChangeText={onLocationChange} onFocus={() => setFocused('location')} onBlur={() => setFocused(null)} placeholder="Search a place" placeholderTextColor={T.muted} autoComplete="off" style={[field, focused === 'location' && fieldFocus, { paddingLeft: 40, marginBottom: 0 }, placeHits.length ? { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 } : null]} /></View>
      {placeHits.length ? <View style={suggestions}>{placeHits.map((hit) => <Pressable accessibilityRole="button" accessibilityLabel={`Choose ${hit.label}`} key={hit.placeId} onPress={() => chooseLocation(hit.label)} style={suggestion}><Ionicons name="location-outline" size={16} color={T.muted} /><Text numberOfLines={1} style={{ fontFamily: F.medium, fontSize: 14, color: T.ink, flex: 1 }}>{hit.label}</Text></Pressable>)}</View> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -PAGE_PAD, marginTop: 10, marginBottom: 22 }} contentContainerStyle={{ gap: 7, paddingHorizontal: PAGE_PAD }}>{CAMPUS_SPOTS.map((spot) => <Pressable key={spot.name} onPress={() => chooseLocation(spot.name)} style={chip(location === spot.name)}><Text style={{ fontFamily: F.semibold, fontSize: 13, color: location === spot.name ? '#fff' : CHIP_FG }}>{spot.name}</Text></Pressable>)}</ScrollView>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}><Text style={[label, { marginBottom: 0 }]}>Needed by</Text><Text style={{ fontFamily: F.medium, fontSize: 12, color: T.muted }}>YYYY-MM-DD</Text></View>
      <TextInput value={date} onChangeText={setDate} onFocus={() => setFocused('date')} onBlur={() => setFocused(null)} keyboardType="numbers-and-punctuation" placeholder="2026-09-30" placeholderTextColor={T.muted} style={[field, focused === 'date' && fieldFocus]} />
      {error ? <Text accessibilityRole="alert" style={{ fontFamily: F.medium, fontSize: 13, color: T.danger, marginTop: -6, marginBottom: 14 }}>{error}</Text> : null}
    </FormScroll>

    <SafeAreaView edges={['bottom']} style={{ backgroundColor: T.bg, borderTopWidth: 1, borderTopColor: T.rule }}><View style={{ paddingHorizontal: PAGE_PAD, paddingTop: 14, paddingBottom: 4, gap: 6 }}><Pressable accessibilityRole="button" disabled={busy || !form.ready} onPress={submit} style={{ backgroundColor: T.cardinal, borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.7 : form.ready ? 1 : 0.45 }}><Text style={{ fontFamily: F.bold, fontSize: 16, color: '#fff' }}>{busy ? 'Saving…' : initial ? 'Save changes' : 'Post request'}</Text></Pressable>{form.hint ? <Text style={{ fontFamily: F.medium, fontSize: 12, color: T.muted, textAlign: 'center' }}>{form.hint}</Text> : null}</View></SafeAreaView>
  </View>;
}

function Photo({ uri, size, cover, onRemove }: { uri: string; size: number; cover: boolean; onRemove: () => void }) { return <View style={{ width: size, height: size }}><Image source={{ uri }} style={{ width: size, height: size, borderRadius: 14 }} contentFit="cover" />{cover ? <View style={coverBadge}><Text style={{ fontFamily: F.bold, fontSize: 9.5, color: '#fff' }}>COVER</Text></View> : null}<Pressable accessibilityLabel="Remove photo" onPress={onRemove} hitSlop={6} style={{ position: 'absolute', top: -6, right: -6, backgroundColor: T.ink, borderRadius: 11, width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="close" size={14} color="#fff" /></Pressable></View>; }

const label = { fontFamily: F.bold, fontSize: 13, color: T.ink, marginBottom: 8 } as const;
const field = { height: 50, backgroundColor: T.fieldbg, borderWidth: 2, borderColor: 'transparent', borderRadius: 13, paddingHorizontal: 16, paddingVertical: 0, fontSize: 15.5, fontFamily: F.medium, color: T.ink, marginBottom: 20 } as const;
const fieldFocus = { backgroundColor: '#fff', borderColor: T.gold } as const;
const coverBadge = { position: 'absolute', left: 6, bottom: 6, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.62)' } as const;
const photoBox = { borderRadius: 14, backgroundColor: T.fieldbg, alignItems: 'center', justifyContent: 'center', gap: 7 } as const;
const photoBoxLabel = { fontFamily: F.semibold, color: T.muted, fontSize: 11.5 } as const;
const chip = (active: boolean) => ({ paddingVertical: 9, paddingHorizontal: 15, borderRadius: 999, backgroundColor: active ? T.ink : T.fieldbg });
const suggestions = { backgroundColor: '#fff', borderWidth: 1, borderTopWidth: 0, borderColor: T.rule, borderBottomLeftRadius: 14, borderBottomRightRadius: 14, overflow: 'hidden' } as const;
const suggestion = { paddingVertical: 12, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: T.rule, flexDirection: 'row', alignItems: 'center', gap: 8 } as const;
