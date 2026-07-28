# Mobile Posting Phase B (The Form) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Turn the Post tab placeholder into a working create-listing form: photos + fields -> upload -> insert -> navigate to the new listing.

**Architecture:** `catalog.ts` holds the mobile category/campus constants. `createListing()` in `lib/listings.ts` inserts a row directly (RLS-allowed). `post.tsx` renders the form (expo-image-picker, fields, chips), and on submit calls `uploadListingPhotos` (Phase A) then `createListing`.

**Tech Stack:** Expo Router, React Native, `@supabase/supabase-js`, `expo-image-picker`, `expo-image`, TypeScript.

## Global Constraints

- App is "Flipd", never "Tassel". No emojis. Terse. One validation surface.
- `seller_id = session.user.id` always (RLS `listings_insert_own` enforces `seller_id = auth.uid()`).
- Category ids exactly: `services, food, housing, goods, event` (event = Popups).
- Campus chips exactly: USC Village (34.0259,-118.2851), Leavey Library (34.0217,-118.2828), Tutor Campus Center (34.0205,-118.2860).
- Photos upload to `listing-photos/{uid}/` via Phase A `uploadListingPhotos`; requires migration 021 applied to actually succeed (form surfaces the RLS error otherwise).
- Verification: `cd mobile && npx tsc --noEmit` + `npx expo export`; full loop proven on-device. Do NOT insert probe rows into production to "shape check" — rely on typecheck + the known-good column set (the same columns the web app inserts).
- `/mobile` isolated; web unaffected.

---

### Task 1: Catalog constants + `createListing`

**Files:**
- Create: `mobile/src/lib/catalog.ts`
- Modify: `mobile/src/lib/listings.ts`

**Interfaces:**
- Produces: `CATEGORIES`, `CAMPUS_SPOTS` (catalog.ts); `type NewListing`, `createListing(input: NewListing): Promise<string>` (listings.ts).

- [ ] **Step 1: Catalog constants**

Create `mobile/src/lib/catalog.ts`:
```typescript
// Copied from the web app to keep mobile self-contained (no cross-package import).
export const CATEGORIES: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'services', label: 'Services' },
  { id: 'food', label: 'Food' },
  { id: 'housing', label: 'Housing' },
  { id: 'goods', label: 'Goods' },
  { id: 'event', label: 'Popups' },
];

export const CAMPUS_SPOTS: ReadonlyArray<{ name: string; lat: number; lng: number }> = [
  { name: 'USC Village', lat: 34.0259, lng: -118.2851 },
  { name: 'Leavey Library', lat: 34.0217, lng: -118.2828 },
  { name: 'Tutor Campus Center', lat: 34.0205, lng: -118.2860 },
];
```

- [ ] **Step 2: `NewListing` + `createListing`**

Append to `mobile/src/lib/listings.ts`:
```typescript
export type NewListing = {
  seller_id: string;
  title: string;
  price: number;
  description: string | null;
  category: string;
  location: string | null;
  place_name: string | null;
  lat: number | null;
  lng: number | null;
  negotiable: boolean;
  photo_urls: string[];
};

// Direct insert (RLS listings_insert_own requires seller_id = auth.uid()).
// Returns the new listing id.
export async function createListing(input: NewListing): Promise<string> {
  const { data, error } = await supabase
    .from('listings')
    .insert({
      seller_id: input.seller_id,
      title: input.title,
      price: input.price,
      description: input.description,
      category: input.category,
      location: input.location,
      place_name: input.place_name,
      lat: input.lat,
      lng: input.lng,
      negotiable: input.negotiable,
      photo_urls: input.photo_urls,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}
```

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: exit 0. (Columns match the exact set the web `/api/listings` route inserts — no probe insert into prod.)

- [ ] **Step 4: Commit**

```bash
git add mobile/src/lib/catalog.ts mobile/src/lib/listings.ts
git commit -m "feat(mobile): createListing + catalog constants (categories, campus spots)"
```

---

### Task 2: The posting form screen

**Files:**
- Add dep: `expo-image-picker`
- Modify: `mobile/src/app/(tabs)/post.tsx` (replace placeholder)

**Interfaces:**
- Consumes: `createListing`, `uploadListingPhotos`, `NewListing` (Task 1 + Phase A); `CATEGORIES`, `CAMPUS_SPOTS` (Task 1); `useSession` (session); `expo-image-picker`, `expo-image`, `expo-router`.

- [ ] **Step 1: Install the picker**

```bash
cd mobile && npx expo install expo-image-picker
```

- [ ] **Step 2: Write the form**

Replace `mobile/src/app/(tabs)/post.tsx`:
```typescript
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
    if (!perm.granted) { Alert.alert('Permission needed', 'Allow photo access to add photos.'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, allowsMultipleSelection: true, selectionLimit: MAX_PHOTOS - photos.length });
    if (!res.canceled) setPhotos((p) => [...p, ...res.assets.map((a) => a.uri)].slice(0, MAX_PHOTOS));
  };
  const addFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Allow camera access to take a photo.'); return; }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!res.canceled) setPhotos((p) => [...p, res.assets[0].uri].slice(0, MAX_PHOTOS));
  };
  const removePhoto = (i: number) => setPhotos((p) => p.filter((_, idx) => idx !== i));

  const pickChip = (s: { name: string; lat: number; lng: number }) => { setLocName(s.name); setCoords({ lat: s.lat, lng: s.lng }); };

  const submit = async () => {
    if (!user) { setError('You must be signed in.'); return; }
    if (!title.trim()) { setError('Add a title.'); return; }
    if (!category) { setError('Pick a category.'); return; }
    if (!locName.trim()) { setError('Add a pickup location.'); return; }
    setSubmitting(true); setError('');
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
            <Pressable onPress={() => removePhoto(i)} style={{ position: 'absolute', top: -6, right: -6, backgroundColor: '#000', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 12 }}>×</Text>
            </Pressable>
          </View>
        ))}
        {photos.length < MAX_PHOTOS && (
          <>
            <Pressable onPress={addFromLibrary} style={box}><Text style={{ color: '#666', fontSize: 11 }}>Library</Text></Pressable>
            <Pressable onPress={addFromCamera} style={box}><Text style={{ color: '#666', fontSize: 11 }}>Camera</Text></Pressable>
          </>
        )}
      </View>

      <TextInput value={title} onChangeText={setTitle} placeholder="Title" style={field} />
      <TextInput value={price} onChangeText={(t) => setPrice(t.replace(/\D/g, ''))} placeholder="Price (blank = Free)" keyboardType="number-pad" style={field} />
      <TextInput value={description} onChangeText={setDescription} placeholder="Description" multiline style={[field, { height: 90, textAlignVertical: 'top' }]} />

      {/* Category */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {CATEGORIES.map((c) => (
          <Pressable key={c.id} onPress={() => setCategory(c.id)} style={chip(category === c.id)}>
            <Text style={{ color: category === c.id ? '#fff' : '#333', fontWeight: '600', fontSize: 13 }}>{c.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Switch value={negotiable} onValueChange={setNegotiable} />
        <Text>Open to offers</Text>
      </View>

      {/* Location */}
      <TextInput value={locName} onChangeText={(t) => { setLocName(t); setCoords(null); }} placeholder="Where you'll meet" style={field} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {CAMPUS_SPOTS.map((s) => (
          <Pressable key={s.name} onPress={() => pickChip(s)} style={chip(locName === s.name)}>
            <Text style={{ color: locName === s.name ? '#fff' : '#333', fontWeight: '600', fontSize: 13 }}>{s.name}</Text>
          </Pressable>
        ))}
      </View>

      {error ? <Text style={{ color: '#c00' }}>{error}</Text> : null}
      <Pressable onPress={submit} disabled={submitting} style={{ backgroundColor: '#111', borderRadius: 10, padding: 16, alignItems: 'center', opacity: submitting ? 0.6 : 1 }}>
        <Text style={{ color: '#fff', fontWeight: '700' }}>{submitting ? 'Posting…' : 'Post listing'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const field = { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, fontSize: 15 } as const;
const box = { width: 72, height: 72, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' as const, justifyContent: 'center' as const };
const chip = (active: boolean) => ({ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: active ? '#111' : '#ddd', backgroundColor: active ? '#111' : '#fff' });
```

- [ ] **Step 3: Typecheck + bundle**

```bash
cd mobile && npx tsc --noEmit && EXPO_PUBLIC_SUPABASE_URL="https://x.supabase.co" EXPO_PUBLIC_SUPABASE_ANON_KEY="test" npx expo export --platform ios --output-dir /tmp/post-export-check
```
Expected: typecheck exit 0; bundle succeeds. Delete `/tmp/post-export-check`.

- [ ] **Step 4: Commit**

```bash
git add "mobile/src/app/(tabs)/post.tsx" mobile/package.json mobile/package-lock.json
git commit -m "feat(mobile): posting form — photos, fields, category/location chips, submit"
```

---

### Task 3: Device verification handoff

**Files:** none.

- [ ] **Step 1: Hand off**

Prereqs the user must do first: apply migrations 020 + 021 to production; sign in on the device. Then in Expo Go: open Post, add a photo (library or camera), fill title/price/category/location (tap a campus chip), submit. Confirm: photo uploads, the listing is created, and the app navigates to the new listing detail showing the photo + fields. Also confirm it appears in the Feed. Capture confirmation. (Builder cannot run a device; tsc + expo export is the pre-device check.)

---

## Self-Review

**Spec coverage:**
- §1 photos (library+camera, up to 8, remove) → Task 2. ✓
- §1 title/price/description/category chips/negotiable → Task 2. ✓
- §1 location text + campus chips (name+coords) → Task 2 + catalog (Task 1). ✓
- §2 validation one surface (title+category+location) → Task 2 submit. ✓
- §2 submit: upload -> createListing -> navigate -> error state → Task 2. ✓
- §2 createListing direct insert, seller_id=uid → Task 1. ✓
- Deliverables: catalog.ts, createListing+NewListing, post.tsx, expo-image-picker → Tasks 1-2. ✓
- Out of scope (edit, compression, pin map, multi-category) → not planned. ✓

**Placeholder scan:** No TBDs; complete component code. The insert-shape verification uses typecheck + the known web column set rather than a prod probe insert (avoids writing junk rows to production).

**Type consistency:** `createListing(input: NewListing): Promise<string>`, `uploadListingPhotos(uris, userId)`, `CATEGORIES`/`CAMPUS_SPOTS` consistent across tasks; category ids and campus coords match the constraints; `useSession().user.id` used for seller_id.

**Ordering:** Task 1 (data + constants) -> Task 2 (form wires them) -> Task 3 (device). Each typechecks; Task 2 adds the bundle check.
