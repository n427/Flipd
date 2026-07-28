import { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Switch, Alert } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useSession } from '@/lib/session';
import { createListing, uploadListingPhotos } from '@/lib/listings';
import { CATEGORIES, CAMPUS_SPOTS } from '@/lib/catalog';

const MAX_PHOTOS = 8;

export default function Post() {
  const router = useRouter();
  const { user } = useSession();
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
      setError(e instanceof Error ? e.message : 'Could not post — try again.');
      setSubmitting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
      {/* Photos */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {photos.map((uri, i) => (
          <View key={uri} style={{ width: 72, height: 72 }}>
            <Image source={{ uri }} style={{ width: 72, height: 72, borderRadius: 8 }} contentFit="cover" />
            <Pressable
              onPress={() => removePhoto(i)}
              style={{ position: 'absolute', top: -6, right: -6, backgroundColor: '#000', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: '#fff', fontSize: 12 }}>×</Text>
            </Pressable>
          </View>
        ))}
        {photos.length < MAX_PHOTOS && (
          <>
            <Pressable onPress={addFromLibrary} style={box}>
              <Text style={{ color: '#666', fontSize: 11 }}>Library</Text>
            </Pressable>
            <Pressable onPress={addFromCamera} style={box}>
              <Text style={{ color: '#666', fontSize: 11 }}>Camera</Text>
            </Pressable>
          </>
        )}
      </View>

      <TextInput value={title} onChangeText={setTitle} placeholder="Title" style={field} />
      <TextInput
        value={price}
        onChangeText={(t) => setPrice(t.replace(/\D/g, ''))}
        placeholder="Price (blank = Free)"
        keyboardType="number-pad"
        style={field}
      />
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="Description"
        multiline
        style={[field, { height: 90, textAlignVertical: 'top' }]}
      />

      {/* Category */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {CATEGORIES.map((cat) => (
          <Pressable key={cat.id} onPress={() => setCategory(cat.id)} style={chip(category === cat.id)}>
            <Text style={{ color: category === cat.id ? '#fff' : '#333', fontWeight: '600', fontSize: 13 }}>{cat.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Switch value={negotiable} onValueChange={setNegotiable} />
        <Text>Open to offers</Text>
      </View>

      {/* Location */}
      <TextInput
        value={locName}
        onChangeText={(t) => {
          setLocName(t);
          setCoords(null);
        }}
        placeholder="Where you'll meet"
        style={field}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {CAMPUS_SPOTS.map((s) => (
          <Pressable key={s.name} onPress={() => pickChip(s)} style={chip(locName === s.name)}>
            <Text style={{ color: locName === s.name ? '#fff' : '#333', fontWeight: '600', fontSize: 13 }}>{s.name}</Text>
          </Pressable>
        ))}
      </View>

      {error ? <Text style={{ color: '#c00' }}>{error}</Text> : null}
      <Pressable
        onPress={submit}
        disabled={submitting}
        style={{ backgroundColor: '#111', borderRadius: 10, padding: 16, alignItems: 'center', opacity: submitting ? 0.6 : 1 }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>{submitting ? 'Posting…' : 'Post listing'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const field = { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, fontSize: 15 } as const;
const box = {
  width: 72,
  height: 72,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: '#ddd',
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};
const chip = (active: boolean) => ({
  paddingVertical: 8,
  paddingHorizontal: 14,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: active ? '#111' : '#ddd',
  backgroundColor: active ? '#111' : '#fff',
});
