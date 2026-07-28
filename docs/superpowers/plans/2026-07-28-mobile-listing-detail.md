# Mobile Listing Detail Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the stub listing route with a real detail screen: photo carousel, info, static map, seller, and a display-only reveal button.

**Architecture:** `fetchListing(id)` in `lib/listings.ts` (two RLS-safe queries merged, mirroring `fetchFeed`); the screen renders a paged photo `FlatList`, info block, static-map block (with text fallback), seller block, and a disabled reveal button. No backend change; no client-side reveal write.

**Tech Stack:** Expo Router, React Native, `@supabase/supabase-js`, `expo-image`, `Linking`, TypeScript.

## Global Constraints

- App is "Flipd", never "Tassel". No emojis. Terse.
- Direct-to-Supabase, anon key only; RLS governs. Seller via `public_profiles` only.
- Reveal button is DISPLAY-ONLY (disabled + "coming soon"); no reveal write from the client.
- Map uses `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` (already in `mobile/.env`); text fallback when no coords or no key.
- Event columns are `event_start` / `event_end` (timestamptz, nullable).
- Verification: `cd mobile && npx tsc --noEmit` + `npx expo export --platform ios`; device test in Expo Go by the user.
- `/mobile` isolated; web app unaffected.

---

### Task 1: `fetchListing` + `ListingDetail` type

**Files:**
- Modify: `mobile/src/lib/listings.ts`

**Interfaces:**
- Consumes: `supabase`, existing `FeedSeller`.
- Produces: `type ListingDetail`, `fetchListing(id: string): Promise<ListingDetail | null>`.

- [ ] **Step 1: Add the type + function**

Append to `mobile/src/lib/listings.ts`:
```typescript
export type ListingDetail = {
  id: string;
  title: string;
  price: number;
  negotiable: boolean;
  description: string | null;
  category: string | null;
  location: string | null;
  photo_urls: string[];
  lat: number | null;
  lng: number | null;
  place_name: string | null;
  event_start: string | null;
  event_end: string | null;
  seller_id: string;
  seller: FeedSeller | null;
};

export async function fetchListing(id: string): Promise<ListingDetail | null> {
  const { data: row, error } = await supabase
    .from('listings')
    .select('id, title, price, negotiable, description, category, location, photo_urls, lat, lng, place_name, event_start, event_end, seller_id')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;

  let seller: FeedSeller | null = null;
  const { data: s, error: se } = await supabase
    .from('public_profiles')
    .select('id, display_name, school_unit, class_year, avatar_url')
    .eq('id', row.seller_id)
    .maybeSingle();
  if (se) throw se;
  seller = (s as FeedSeller) ?? null;

  return {
    ...(row as Omit<ListingDetail, 'seller'>),
    price: row.price ?? 0,
    negotiable: row.negotiable ?? false,
    photo_urls: row.photo_urls ?? [],
    seller,
  };
}
```

- [ ] **Step 2: Typecheck**

```bash
cd mobile && npx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/lib/listings.ts
git commit -m "feat(mobile): fetchListing + ListingDetail type"
```

---

### Task 2: Photo carousel component

**Files:**
- Create: `mobile/src/components/PhotoCarousel.tsx`

**Interfaces:**
- Consumes: `expo-image`.
- Produces: `PhotoCarousel({ photos }: { photos: string[] })`.

- [ ] **Step 1: Write the component**

Create `mobile/src/components/PhotoCarousel.tsx`:
```typescript
import { useState } from 'react';
import { View, Text, FlatList, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';

export function PhotoCarousel({ photos }: { photos: string[] }) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);

  if (!photos.length) {
    return (
      <View style={{ width, height: width, backgroundColor: '#f0efec', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#b8b4ad' }}>No photo</Text>
      </View>
    );
  }

  return (
    <View>
      <FlatList
        data={photos}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(uri, i) => `${i}-${uri}`}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <Image source={{ uri: item }} style={{ width, height: width }} contentFit="cover" />
        )}
      />
      {photos.length > 1 && (
        <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center', paddingVertical: 10 }}>
          {photos.map((_, i) => (
            <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: i === index ? '#111' : '#ccc' }} />
          ))}
        </View>
      )}
    </View>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd mobile && npx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/PhotoCarousel.tsx
git commit -m "feat(mobile): swipeable photo carousel with dots"
```

---

### Task 3: The detail screen

**Files:**
- Modify: `mobile/src/app/(tabs)/listing/[id].tsx` (replace stub)

**Interfaces:**
- Consumes: `fetchListing`, `ListingDetail`, `priceLabel` (Task 1); `PhotoCarousel` (Task 2); `expo-image`, `Linking`, `expo-router`.

- [ ] **Step 1: Write the screen**

Replace `mobile/src/app/(tabs)/listing/[id].tsx`:
```typescript
import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Linking, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { fetchListing, ListingDetail, priceLabel } from '@/lib/listings';
import { PhotoCarousel } from '@/components/PhotoCarousel';

const MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'notfound'>('loading');

  useEffect(() => {
    (async () => {
      try {
        const l = await fetchListing(String(id));
        if (!l) { setState('notfound'); return; }
        setListing(l);
        setState('ready');
      } catch {
        setState('error');
      }
    })();
  }, [id]);

  if (state === 'loading') return <View style={c.center}><ActivityIndicator /></View>;
  if (state === 'error') return <View style={c.center}><Text style={c.muted}>Couldn&apos;t load this listing.</Text></View>;
  if (state === 'notfound' || !listing) return <View style={c.center}><Text style={c.muted}>Listing not found.</Text></View>;

  const hasCoords = listing.lat != null && listing.lng != null;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${listing.lat},${listing.lng}`;
  const sellerLine = [listing.seller?.display_name, listing.seller?.school_unit, listing.seller?.class_year]
    .filter(Boolean).join(' · ');

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
      <PhotoCarousel photos={listing.photo_urls} />

      <View style={{ padding: 16, gap: 8 }}>
        <Text style={{ fontSize: 22, fontWeight: '800' }}>{listing.title}</Text>
        <Text style={{ fontSize: 18, fontWeight: '700', color: listing.price > 0 ? '#111' : '#990000' }}>
          {priceLabel(listing.price)}{listing.negotiable ? '  ·  Negotiable' : ''}
        </Text>
        {listing.description ? <Text style={{ fontSize: 15, color: '#333', lineHeight: 22 }}>{listing.description}</Text> : null}

        {/* Location */}
        {hasCoords && MAPS_KEY ? (
          <View style={{ marginTop: 8, gap: 8 }}>
            <Text style={{ color: '#666' }}>Pickup at {listing.place_name || listing.location || 'the pinned spot'}</Text>
            <Pressable onPress={() => Linking.openURL(mapsUrl)} style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#eee' }}>
              <Image
                source={{ uri: `https://maps.googleapis.com/maps/api/staticmap?center=${listing.lat},${listing.lng}&zoom=16&size=600x240&scale=2&markers=color:red%7C${listing.lat},${listing.lng}&key=${MAPS_KEY}` }}
                style={{ width: '100%', height: 160 }}
                contentFit="cover"
              />
            </Pressable>
            <Pressable onPress={() => Linking.openURL(mapsUrl)}>
              <Text style={{ color: '#111', fontWeight: '600' }}>Open in Google Maps</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={{ color: '#666', marginTop: 8 }}>Pickup at {listing.place_name || listing.location || 'USC · pickup'}</Text>
        )}

        {/* Seller */}
        {listing.seller ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
            {listing.seller.avatar_url
              ? <Image source={{ uri: listing.seller.avatar_url }} style={{ width: 36, height: 36, borderRadius: 18 }} contentFit="cover" />
              : <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#eee' }} />}
            <Text style={{ fontWeight: '600' }}>{sellerLine || 'A Trojan'}</Text>
          </View>
        ) : null}

        {/* Reveal — display only for now */}
        <View style={{ marginTop: 20, gap: 6 }}>
          <Pressable disabled style={{ backgroundColor: '#ccc', borderRadius: 10, padding: 16, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Reveal Contact</Text>
          </Pressable>
          <Text style={{ color: '#999', fontSize: 12, textAlign: 'center' }}>Requesting contact from the app is coming soon.</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const c = {
  center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 24 },
  muted: { color: '#666' },
};
```

- [ ] **Step 2: Typecheck + bundle**

```bash
cd mobile && npx tsc --noEmit && EXPO_PUBLIC_SUPABASE_URL="https://x.supabase.co" EXPO_PUBLIC_SUPABASE_ANON_KEY="test" npx expo export --platform ios --output-dir /tmp/detail-export-check
```
Expected: typecheck exit 0; bundle succeeds. Delete `/tmp/detail-export-check` after.

- [ ] **Step 3: Verify fetchListing query shape (live schema, service-role, shape only)**

Confirm the selected columns exist by running a shape check (service-role bypasses RLS; this only validates columns, not RLS behavior which 019 tests already cover):
```bash
cd "$(git rev-parse --show-toplevel)" && node -e "
const {createClient}=require('./node_modules/@supabase/supabase-js');
const fs=require('fs');
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]}));
const a=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY);
a.from('listings').select('id, title, price, negotiable, description, category, location, photo_urls, lat, lng, place_name, event_start, event_end, seller_id').limit(1).then(({data,error})=>console.log(error?('ERROR '+error.message):('OK columns valid, sample id='+(data[0]&&data[0].id))));
"
```
Expected: `OK columns valid, ...`.

- [ ] **Step 4: Commit**

```bash
git add "mobile/src/app/(tabs)/listing/[id].tsx"
git commit -m "feat(mobile): real listing detail — carousel, map, seller, deferred reveal"
```

---

### Task 4: Device verification handoff

**Files:** none.

- [ ] **Step 1: Hand off**

User runs `cd mobile && npx expo start`, signs in, taps a feed card, and confirms: photos swipe, info shows, the map renders (or falls back to text), "Open in Google Maps" opens the maps app, seller shows, and the reveal button is present-but-disabled with the note. Capture confirmation. (Map render on device also depends on the Google key allowing app/no-referrer Static Maps requests — if the map is blank, that's the key restriction, not the code; text fallback still shows the location.)

---

## Self-Review

**Spec coverage:**
- §1 two-query fetchListing (+ null/not-found) → Task 1. ✓
- §1 ListingDetail type w/ negotiable/description/category/coords/event → Task 1. ✓
- §2 photo carousel + dots + empty → Task 2. ✓
- §2 info block (title/price/negotiable/description) → Task 3. ✓
- §2 static map + Open in Maps + text fallback (coords/key gated) → Task 3. ✓
- §2 seller block → Task 3. ✓
- §2 reveal button display-only + note → Task 3. ✓
- Out of scope (reveal send, native map, zoom, edit) → not planned. ✓

**Placeholder scan:** No TBDs; complete code in every step. Event columns use the real `event_start`/`event_end` (verified). Shape check in Task 3.3 validates columns against the live schema.

**Type consistency:** `ListingDetail`/`fetchListing`/`priceLabel`/`FeedSeller` consistent across tasks; `PhotoCarousel({ photos })` matches its use in Task 3; `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` matches `mobile/.env`.

**Ordering:** Task 1 (data) → 2 (carousel) → 3 (screen) → 4 (device). Each typechecks; Task 3 adds bundle + shape checks.
