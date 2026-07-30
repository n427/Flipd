import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Switch, Alert, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSession } from '@/lib/session';
import { fetchListing, updateListing, generateDescription } from '@/lib/listings';
import { CATEGORIES, CAMPUS_SPOTS } from '@/lib/catalog';
import { searchPlaces, placeDetails, PlaceHit } from '@/lib/places';
import { T, F } from '@/lib/theme';

const MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
const MAX_PHOTOS = 8;

export default function EditListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useSession();

  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  // photos holds a mix of kept URLs (http…) and new local URIs. updateListing
  // splits them by the http prefix into the manifest the route expects.
  const [photos, setPhotos] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [negotiable, setNegotiable] = useState(false);
  const [locName, setLocName] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const l = await fetchListing(String(id));
      if (!l) {
        setDenied(true);
        setLoading(false);
        return;
      }
      if (!user || user.id !== l.seller_id) {
        setDenied(true);
        setLoading(false);
        return;
      }
      setPhotos(l.photo_urls ?? []);
      setTitle(l.title);
      setPrice(l.price > 0 ? String(l.price) : '');
      setDescription(l.description ?? '');
      setCategory(l.category);
      setNegotiable(l.negotiable);
      setLocName(l.place_name || l.location || '');
      if (l.lat != null && l.lng != null) setCoords({ lat: l.lat, lng: l.lng });
      setLoading(false);
    })();
  }, [id, user]);

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
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to add photos.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS - photos.length,
    });
    if (!res.canceled) setPhotos((p) => [...p, ...res.assets.map((a) => a.uri)].slice(0, MAX_PHOTOS));
  };

  const addFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow camera access to take a photo.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!res.canceled) setPhotos((p) => [...p, res.assets[0].uri].slice(0, MAX_PHOTOS));
  };

  const removePhoto = (i: number) => setPhotos((p) => p.filter((_, idx) => idx !== i));
  const pickChip = (s: { name: string; lat: number; lng: number }) => {
    setLocName(s.name);
    setCoords({ lat: s.lat, lng: s.lng });
    setHits([]);
  };

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

  const save = useCallback(async () => {
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
    if (photos.length === 0) {
      setError('Keep at least one photo.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const parsedPrice = parseInt(price, 10);
      await updateListing(String(id), {
        title: title.trim(),
        price: Number.isFinite(parsedPrice) && parsedPrice > 0 ? parsedPrice : 0,
        description: description.trim() || null,
        category,
        negotiable,
        location: locName.trim(),
        place_name: locName.trim(),
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        photos,
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save — try again.');
      setSaving(false);
    }
  }, [id, title, price, description, category, negotiable, locName, coords, photos, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.bg }}>
        <ActivityIndicator color={T.cardinal} />
      </View>
    );
  }
  if (denied) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.bg, padding: 24 }}>
        <Text style={{ fontFamily: F.medium, color: T.muted, textAlign: 'center' }}>
          You can only edit your own listings.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 40 }} style={{ backgroundColor: T.bg }}>
      <Text style={{ fontFamily: F.black, fontSize: 26, color: T.ink, letterSpacing: -0.8, marginBottom: 18 }}>
        Edit listing
      </Text>

      {/* Photos */}
      <Text style={label}>Photos</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
        {photos.map((uri, i) => (
          <View key={`${uri}-${i}`} style={{ width: 76, height: 76 }}>
            <Image source={{ uri }} style={{ width: 76, height: 76, borderRadius: 12 }} contentFit="cover" />
            <Pressable
              onPress={() => removePhoto(i)}
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
            <Pressable onPress={addFromLibrary} style={photoBox}>
              <Ionicons name="images-outline" size={20} color={T.muted} />
              <Text style={photoBoxLabel}>Library</Text>
            </Pressable>
            <Pressable onPress={addFromCamera} style={photoBox}>
              <Ionicons name="camera-outline" size={20} color={T.muted} />
              <Text style={photoBoxLabel}>Camera</Text>
            </Pressable>
          </>
        )}
      </View>

      {/* Title / price / description */}
      <Text style={label}>Title</Text>
      <TextInput value={title} onChangeText={setTitle} placeholder="What are you selling?" placeholderTextColor={T.muted} style={field} />

      <Text style={label}>Price</Text>
      <TextInput
        value={price}
        onChangeText={(t) => setPrice(t.replace(/\D/g, ''))}
        placeholder="Leave blank for Free"
        placeholderTextColor={T.muted}
        keyboardType="number-pad"
        style={field}
      />

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={[label, { marginBottom: 0 }]}>Description</Text>
        <Pressable
          onPress={fillWithAI}
          disabled={aiBusy}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 5, opacity: aiBusy ? 0.6 : 1 }}
        >
          <Ionicons name="sparkles" size={14} color={T.cardinal} />
          <Text style={{ fontFamily: F.bold, fontSize: 13, color: T.cardinal }}>
            {aiBusy ? 'Writing…' : 'Fill with AI'}
          </Text>
        </Pressable>
      </View>
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="Details, condition, pickup notes…"
        placeholderTextColor={T.muted}
        multiline
        style={[field, { height: 96, textAlignVertical: 'top', paddingTop: 14 }]}
      />

      {/* Category */}
      <Text style={label}>Category</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {CATEGORIES.map((cat) => (
          <Pressable key={cat.id} onPress={() => setCategory(cat.id)} style={chip(category === cat.id)}>
            <Text style={{ fontFamily: F.semibold, color: category === cat.id ? '#fff' : T.ink, fontSize: 13.5 }}>
              {cat.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Negotiable */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <Switch value={negotiable} onValueChange={setNegotiable} trackColor={{ true: T.cardinal }} />
        <Text style={{ fontFamily: F.medium, fontSize: 15, color: T.ink }}>Open to offers</Text>
      </View>

      {/* Location */}
      <Text style={label}>Where you’ll meet</Text>
      <TextInput
        value={locName}
        onChangeText={onLocChange}
        placeholder="Search a place, or pick a campus spot"
        placeholderTextColor={T.muted}
        style={[field, hits.length ? { marginBottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 } : null]}
      />
      {hits.length > 0 ? (
        <View style={{ backgroundColor: '#fff', borderWidth: 1, borderTopWidth: 0, borderColor: T.rule, borderBottomLeftRadius: 14, borderBottomRightRadius: 14, marginBottom: 12, overflow: 'hidden' }}>
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
      {coords && MAPS_KEY ? (
        <Image
          source={{
            uri: `https://maps.googleapis.com/maps/api/staticmap?center=${coords.lat},${coords.lng}&zoom=16&size=600x200&scale=2&markers=color:red%7C${coords.lat},${coords.lng}&key=${MAPS_KEY}`,
          }}
          style={{ width: '100%', height: 130, borderRadius: 12, marginBottom: 12 }}
          contentFit="cover"
        />
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        {CAMPUS_SPOTS.map((s) => (
          <Pressable key={s.name} onPress={() => pickChip(s)} style={chip(locName === s.name)}>
            <Text style={{ fontFamily: F.semibold, color: locName === s.name ? '#fff' : T.ink, fontSize: 13.5 }}>
              {s.name}
            </Text>
          </Pressable>
        ))}
      </View>

      {error ? <Text style={{ fontFamily: F.medium, color: T.danger, marginTop: 8 }}>{error}</Text> : null}

      <Pressable
        onPress={save}
        disabled={saving}
        style={{ backgroundColor: T.cardinal, borderRadius: 14, paddingVertical: 17, alignItems: 'center', marginTop: 20, opacity: saving ? 0.7 : 1 }}
      >
        <Text style={{ fontFamily: F.bold, color: '#fff', fontSize: 16 }}>{saving ? 'Saving…' : 'Save changes'}</Text>
      </Pressable>
      <Pressable onPress={() => router.back()} style={{ marginTop: 14, alignItems: 'center' }}>
        <Text style={{ fontFamily: F.medium, color: T.muted, fontSize: 14.5 }}>Cancel</Text>
      </Pressable>
    </ScrollView>
  );
}

const label = { fontFamily: F.bold, fontSize: 13, color: T.ink, marginBottom: 8 } as const;
const field = {
  backgroundColor: T.fieldbg,
  borderWidth: 1,
  borderColor: T.fieldbg,
  borderRadius: 14,
  paddingHorizontal: 16,
  paddingVertical: 14,
  fontSize: 15,
  fontFamily: F.medium,
  color: T.ink,
  marginBottom: 20,
} as const;
const photoBox = {
  width: 76,
  height: 76,
  borderRadius: 12,
  backgroundColor: T.fieldbg,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  gap: 3,
};
const photoBoxLabel = { fontFamily: F.medium, color: T.muted, fontSize: 11 } as const;
const chip = (active: boolean) => ({
  paddingVertical: 9,
  paddingHorizontal: 15,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: active ? T.cardinal : T.rule,
  backgroundColor: active ? T.cardinal : '#fff',
});
