import { useState } from 'react';
import { View, Text, TextInput, Pressable, Alert, ScrollView, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSession } from '@/lib/session';
import { createListing, uploadListingPhotos, generateDescription } from '@/lib/listings';
import { FormScroll } from '@/components/FormScroll';
import { MapPreview } from '@/components/MapPreview';
import { CATEGORIES, CAMPUS_SPOTS } from '@/lib/catalog';
import { searchPlaces, placeDetails, PlaceHit } from '@/lib/places';
import { T, F, S } from '@/lib/theme';

const MAX_PHOTOS = 6;
const MAX_TITLE = 60;

export default function Post() {
  const router = useRouter();
  const { user } = useSession();
  // The design's photo row is `repeat(3, 1fr)` — tiles divide the content
  // width rather than sitting at a fixed size, so the row always reaches both
  // margins. A hardcoded tile leaves dead space on the right that grows with
  // screen size (42pt on a 390pt phone, 82pt on a Pro Max).
  const { width } = useWindowDimensions();
  const tile = (width - PAGE_PAD * 2 - GRID_GAP * 2) / 3;
  const [photos, setPhotos] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [negotiable, setNegotiable] = useState(false);
  const [locName, setLocName] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);

  const fillWithAI = async () => {
    if (!title.trim() || !category) {
      setError('Add a title and category first, then Fill with AI.');
      return;
    }
    setAiBusy(true);
    setError('');
    try {
      const text = await generateDescription(title.trim(), category);
      setDescription(text.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI is unavailable right now.');
    } finally {
      setAiBusy(false);
    }
  };

  const addFromLibrary = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow photo access to add photos.');
        return;
      }
      const remaining = MAX_PHOTOS - photos.length;
      // Picking one at a time gives a native square crop step (allowsEditing).
      // Multi-select can't crop, so single-select unlocks crop-on-add.
      const res =
        remaining === 1
          ? await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect: [1, 1] })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              quality: 0.8,
              allowsMultipleSelection: true,
              selectionLimit: remaining,
            });
      if (!res.canceled) setPhotos((p) => [...p, ...res.assets.map((a) => a.uri)].slice(0, MAX_PHOTOS));
    } catch {
      Alert.alert('Couldn’t open photos', 'Try again.');
    }
  };

  const addFromCamera = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow camera access to take a photo.');
        return;
      }
      // Crop/reposition step after capture.
      const res = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: true, aspect: [1, 1] });
      if (!res.canceled) setPhotos((p) => [...p, res.assets[0].uri].slice(0, MAX_PHOTOS));
    } catch {
      Alert.alert('Couldn’t open camera', 'Try again.');
    }
  };

  const removePhoto = (i: number) => setPhotos((p) => p.filter((_, idx) => idx !== i));
  const pickChip = (s: { name: string; lat: number; lng: number }) => {
    setLocName(s.name);
    setCoords({ lat: s.lat, lng: s.lng });
    setHits([]);
  };

  // Place search
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const onLocChange = async (t: string) => {
    setLocName(t);
    setCoords(null);
    if (t.trim().length < 3) {
      setHits([]);
      return;
    }
    setHits(await searchPlaces(t));
  };
  const pickPlace = async (h: PlaceHit) => {
    setHits([]);
    setLocName(h.label);
    const d = await placeDetails(h.placeId);
    if (d) {
      setLocName(d.name);
      setCoords({ lat: d.lat, lng: d.lng });
    }
  };

  const submit = async () => {
    if (!user) {
      setError('You must be signed in.');
      return;
    }
    if (!title.trim()) {
      setError('Add a title.');
      return;
    }
    if (!category) {
      setError('Pick a category.');
      return;
    }
    if (!locName.trim()) {
      setError('Add a pickup location.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const photo_urls = photos.length ? await uploadListingPhotos(photos, user.id) : [];
      const parsedPrice = parseInt(price, 10);
      const id = await createListing({
        seller_id: user.id,
        title: title.trim(),
        price: Number.isFinite(parsedPrice) && parsedPrice > 0 ? parsedPrice : 0,
        description: description.trim() || null,
        category,
        location: locName.trim(),
        place_name: locName.trim(),
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        negotiable,
        photo_urls,
      });
      router.replace(`/(tabs)/listing/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not post. Try again.');
      setSubmitting(false);
    }
  };

  // Progress: photos, title, category, location → 0/4 in the header.
  const steps = [photos.length > 0, !!title.trim(), !!category, !!locName.trim()].filter(Boolean).length;
  const ready = !!title.trim() && !!category && !!locName.trim();

  // One hint line under the button, showing the next thing standing between
  // this draft and a live listing — a single validation surface rather than
  // per-field error text. Null once the draft is postable: nothing left to say.
  const hint = !title.trim()
    ? 'Add a title to post'
    : !category
      ? 'Pick a category to post'
      : !locName.trim()
        ? 'Add a meetup spot so buyers know where to go'
        : null;

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      {/* Header: X + title + step counter */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: T.bg }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: PAGE_PAD,
            paddingTop: 8,
            paddingBottom: 14,
            borderBottomWidth: 1,
            borderBottomColor: T.rule,
          }}
        >
          <Pressable onPress={() => router.replace('/(tabs)/feed')} hitSlop={10}>
            <Ionicons name="close" size={22} color={T.muted} />
          </Pressable>
          <Text style={{ flex: 1, fontFamily: F.bold, fontSize: 17, color: T.ink, letterSpacing: -0.34 }}>
            New listing
          </Text>
          <Text style={{ fontFamily: F.semibold, fontSize: 12.5, color: T.muted }}>{steps}/4</Text>
        </View>
      </SafeAreaView>

      <FormScroll contentContainerStyle={{ paddingHorizontal: PAGE_PAD, paddingTop: S.screenTop, paddingBottom: S.screenBottom }}>
        {/* Photos — 3-up grid, add tiles first so the CTA never hides below the fold */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <Text style={label}>Photos</Text>
          <Text style={{ fontFamily: F.medium, fontSize: 12, color: T.muted }}>Up to {MAX_PHOTOS} · first is the cover</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP, marginBottom: 22 }}>
          {photos.map((uri, i) => (
            <View key={uri} style={{ width: tile, height: tile }}>
              <Image source={{ uri }} style={{ width: tile, height: tile, borderRadius: 14 }} contentFit="cover" />
              {i === 0 ? (
                <View style={coverBadge}>
                  <Text style={{ fontFamily: F.bold, fontSize: 9.5, color: '#fff' }}>COVER</Text>
                </View>
              ) : null}
              <Pressable
                onPress={() => removePhoto(i)}
                hitSlop={6}
                style={{
                  position: 'absolute',
                  top: -6,
                  right: -6,
                  backgroundColor: T.ink,
                  borderRadius: 11,
                  width: 22,
                  height: 22,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="close" size={14} color="#fff" />
              </Pressable>
            </View>
          ))}
          {photos.length < MAX_PHOTOS && (
            <>
              <Pressable onPress={addFromLibrary} style={[photoBox, { width: tile, height: tile }]}>
                <Ionicons name="images-outline" size={21} color={T.muted} />
                <Text style={photoBoxLabel}>Library</Text>
              </Pressable>
              <Pressable onPress={addFromCamera} style={[photoBox, { width: tile, height: tile }]}>
                <Ionicons name="camera-outline" size={21} color={T.muted} />
                <Text style={photoBoxLabel}>Camera</Text>
              </Pressable>
              {/* Ghost tile completes the 3-up row while there's still room */}
              {photos.length === 0 ? (
                <View style={[photoBox, { width: tile, height: tile, backgroundColor: '#FAFAFB' }]}>
                  <Text style={{ fontFamily: F.medium, fontSize: 11.5, color: '#B6B8BD', textAlign: 'center', lineHeight: 15 }}>
                    Add{'\n'}more
                  </Text>
                </View>
              ) : null}
            </>
          )}
        </View>

        {/* Title */}
        <Text style={label}>Title</Text>
        <TextInput
          value={title}
          onChangeText={(t) => setTitle(t.slice(0, MAX_TITLE))}
          onFocus={() => setFocused('title')}
          onBlur={() => setFocused(null)}
          placeholder="What are you selling?"
          placeholderTextColor={T.muted}
          maxLength={MAX_TITLE}
          style={[field, focused === 'title' && fieldFocus, { marginBottom: 6 }]}
        />
        <Text style={{ fontFamily: F.medium, fontSize: 11.5, color: T.muted, textAlign: 'right', marginBottom: 18 }}>
          {title.length}/{MAX_TITLE}
        </Text>

        {/* Price — $ prefix sits inside the field */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <Text style={[label, { marginBottom: 0 }]}>Price</Text>
          <Text style={{ fontFamily: F.medium, fontSize: 12, color: T.muted }}>Leave blank for free</Text>
        </View>
        <View style={{ justifyContent: 'center', marginBottom: 22 }}>
          <Text style={{ position: 'absolute', left: 16, zIndex: 1, fontFamily: F.bold, fontSize: 16, color: T.muted }}>$</Text>
          <TextInput
            value={price}
            onChangeText={(t) => setPrice(t.replace(/\D/g, ''))}
            onFocus={() => setFocused('price')}
            onBlur={() => setFocused(null)}
            placeholder="0"
            placeholderTextColor={T.muted}
            keyboardType="number-pad"
            style={[field, focused === 'price' && fieldFocus, { marginBottom: 0, paddingLeft: 34, fontFamily: F.semibold }]}
          />
        </View>

        {/* Description */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={[label, { marginBottom: 0 }]}>Description</Text>
          <Pressable
            onPress={fillWithAI}
            disabled={aiBusy}
            hitSlop={8}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, opacity: aiBusy ? 0.6 : 1 }}
          >
            <Ionicons name="sparkles" size={13} color={T.cardinal} />
            <Text style={{ fontFamily: F.bold, fontSize: 12.5, color: T.cardinal }}>
              {aiBusy ? 'Writing…' : 'Fill with AI'}
            </Text>
          </Pressable>
        </View>
        <TextInput
          value={description}
          onChangeText={setDescription}
          onFocus={() => setFocused('desc')}
          onBlur={() => setFocused(null)}
          placeholder="Condition, pickup notes, why you’re selling…"
          placeholderTextColor={T.muted}
          multiline
          style={[
            field,
            focused === 'desc' && fieldFocus,
            // Multiline overrides the single-line 50pt height/centering.
            { height: 104, textAlignVertical: 'top', paddingTop: 14, paddingBottom: 14, fontSize: 15, lineHeight: 21, marginBottom: 22 },
          ]}
        />

        {/* Category — full-bleed horizontal scroll */}
        <Text style={label}>Category</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -PAGE_PAD, marginBottom: 22 }}
          contentContainerStyle={{ gap: 7, paddingHorizontal: PAGE_PAD }}
        >
          {CATEGORIES.map((cat) => (
            <Pressable key={cat.id} onPress={() => setCategory(category === cat.id ? null : cat.id)} style={chip(category === cat.id)}>
              <Text style={{ fontFamily: F.semibold, fontSize: 13.5, color: category === cat.id ? '#fff' : CHIP_FG }}>
                {cat.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Open to offers */}
        <Pressable
          onPress={() => setNegotiable((v) => !v)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            backgroundColor: T.fieldbg,
            borderRadius: 14,
            paddingHorizontal: 16,
            paddingVertical: 14,
            marginBottom: 22,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.bold, fontSize: 14, color: T.ink }}>Open to offers</Text>
            <Text style={{ fontFamily: F.medium, fontSize: 12, color: T.muted, marginTop: 2 }}>Buyers can send you a price</Text>
          </View>
          {/* Pill toggle matching the design rather than the platform Switch */}
          <View
            style={{
              width: 50,
              height: 30,
              borderRadius: 999,
              padding: 3,
              backgroundColor: negotiable ? T.cardinal : '#DCDCE0',
              alignItems: negotiable ? 'flex-end' : 'flex-start',
            }}
          >
            <View style={{ width: 24, height: 24, borderRadius: 999, backgroundColor: '#fff' }} />
          </View>
        </Pressable>

        {/* Location */}
        <Text style={label}>Where you’ll meet</Text>
        <View style={{ justifyContent: 'center' }}>
          <Ionicons name="location-outline" size={17} color={T.muted} style={{ position: 'absolute', left: 15, zIndex: 1 }} />
          <TextInput
            value={locName}
            onChangeText={onLocChange}
            onFocus={() => setFocused('loc')}
            onBlur={() => setFocused(null)}
            placeholder="Search a place"
            textContentType="none"
            autoComplete="off"
            placeholderTextColor={T.muted}
            style={[
              field,
              focused === 'loc' && fieldFocus,
              { paddingLeft: 40, marginBottom: 0 },
              hits.length ? { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 } : null,
            ]}
          />
        </View>

        {/* Place suggestions */}
        {hits.length > 0 ? (
          <View style={{ backgroundColor: '#fff', borderWidth: 1, borderTopWidth: 0, borderColor: T.rule, borderBottomLeftRadius: 14, borderBottomRightRadius: 14, overflow: 'hidden' }}>
            {hits.map((h) => (
              <Pressable
                key={h.placeId}
                onPress={() => pickPlace(h)}
                style={{ paddingVertical: 12, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: T.rule, flexDirection: 'row', alignItems: 'center', gap: 8 }}
              >
                <Ionicons name="location-outline" size={16} color={T.muted} />
                <Text numberOfLines={1} style={{ fontFamily: F.medium, fontSize: 14, color: T.ink, flex: 1 }}>{h.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* Campus spot chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -PAGE_PAD, marginTop: 10 }}
          contentContainerStyle={{ gap: 7, paddingHorizontal: PAGE_PAD }}
        >
          {CAMPUS_SPOTS.map((s) => (
            <Pressable key={s.name} onPress={() => pickChip(s)} style={chip(locName === s.name)}>
              <Text style={{ fontFamily: F.semibold, fontSize: 13, color: locName === s.name ? '#fff' : CHIP_FG }}>
                {s.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Map preview once a spot resolves to coordinates */}
        {coords ? (
          <View style={{ marginTop: 12 }}>
            <MapPreview lat={coords.lat} lng={coords.lng} label={locName} />
          </View>
        ) : null}

        {error ? <Text style={{ fontFamily: F.medium, fontSize: 13, color: T.danger, marginTop: 14 }}>{error}</Text> : null}
      </FormScroll>

      {/* Sticky footer — the design's fixed CTA bar */}
      <SafeAreaView edges={['bottom']} style={{ backgroundColor: T.bg, borderTopWidth: 1, borderTopColor: T.rule }}>
        <View style={{ paddingHorizontal: PAGE_PAD, paddingTop: 14, paddingBottom: 4, gap: 6 }}>
          <Pressable
            onPress={submit}
            disabled={submitting || !ready}
            style={{
              backgroundColor: T.cardinal,
              borderRadius: 14,
              height: 52,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: submitting ? 0.7 : ready ? 1 : 0.45,
            }}
          >
            <Text style={{ fontFamily: F.bold, fontSize: 16, color: '#fff' }}>
              {submitting ? 'Posting…' : 'Post listing'}
            </Text>
          </Pressable>
          {hint ? (
            <Text style={{ fontFamily: F.medium, fontSize: 12, color: T.muted, textAlign: 'center' }}>{hint}</Text>
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

const CHIP_FG = '#43464C'; // design's idle chip label — softer than full ink
const PAGE_PAD = 20; // screen gutter — grid math depends on it
const GRID_GAP = 10;
const label = { fontFamily: F.bold, fontSize: 13, color: T.ink, marginBottom: 8 } as const;
// Design spec: 50pt tall, 13pt radius, #f4f4f6 fill. The 2pt border is always
// present (transparent when idle) so focusing swaps only its colour — with
// borderWidth toggling instead, RN would reflow the field and the text would
// visibly jump on every focus.
const field = {
  height: 50,
  backgroundColor: T.fieldbg,
  borderWidth: 2,
  borderColor: 'transparent',
  borderRadius: 13,
  paddingHorizontal: 16,
  paddingVertical: 0,
  fontSize: 15.5,
  fontFamily: F.medium,
  color: T.ink,
  marginBottom: 20,
} as const;
// Gold focus ring, matching the design's inset highlight.
const fieldFocus = { backgroundColor: '#fff', borderColor: T.gold } as const;
const coverBadge = {
  position: 'absolute' as const,
  left: 6,
  bottom: 6,
  paddingHorizontal: 6,
  paddingVertical: 3,
  borderRadius: 6,
  backgroundColor: 'rgba(0,0,0,0.62)',
};
const photoBox = {
  borderRadius: 14,
  backgroundColor: T.fieldbg,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  gap: 7,
};
const photoBoxLabel = { fontFamily: F.semibold, color: T.muted, fontSize: 11.5 } as const;
// Design spec: borderless pills — filled grey when idle, near-black when
// selected. A hairline border here would fight the filled style and make the
// row look boxy against the flat fields above it.
const chip = (active: boolean) => ({
  paddingVertical: 9,
  paddingHorizontal: 15,
  borderRadius: 999,
  backgroundColor: active ? T.ink : T.fieldbg,
});
