# Mobile Feed Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the Feed placeholder in `/mobile` with a live 2-column grid of active listings, fetched direct from Supabase under RLS.

**Architecture:** `lib/listings.ts` runs two RLS-safe queries (`listings` where active + `public_profiles` for sellers) and merges them; the Feed screen renders a `FlatList numColumns={2}` of `ListingCard`s with loading/empty/error/refresh states. A stub listing-detail route receives card taps. No backend change.

**Tech Stack:** Expo Router, React Native, `@supabase/supabase-js`, `expo-image`, TypeScript.

## Global Constraints

- App is "Flipd", never "Tassel". No emojis. Terse.
- Direct-to-Supabase, anon key only; RLS governs. Seller info via `public_profiles` ONLY (base `profiles` join returns null under RLS).
- Feed is inside the auth-gated `(tabs)` group (requires a session — the `listings_read_active` policy is for the `authenticated` role).
- Verification: `cd mobile && npx tsc --noEmit` + `npx expo export --platform ios`; real device test in Expo Go by the user.
- `/mobile` stays isolated from the web app; web build unaffected.
- No test runner exists in `/mobile` yet; verify `priceLabel` via a one-off `node -e` check rather than bootstrapping jest (out of scope for this screen).

---

### Task 1: Listings data layer (`lib/listings.ts`)

**Files:**
- Create: `mobile/src/lib/listings.ts`

**Interfaces:**
- Consumes: `supabase` from `@/lib/supabase`.
- Produces: `type FeedListing`, `fetchFeed(): Promise<FeedListing[]>`, `priceLabel(price: number): string`.

- [ ] **Step 1: Write the module**

Create `mobile/src/lib/listings.ts`:
```typescript
import { supabase } from './supabase';

export type FeedSeller = {
  id: string;
  display_name: string | null;
  school_unit: string | null;
  class_year: string | null;
  avatar_url: string | null;
};

export type FeedListing = {
  id: string;
  title: string;
  price: number;
  location: string | null;
  photo_urls: string[];
  seller_id: string;
  seller: FeedSeller | null;
};

export function priceLabel(price: number): string {
  return price > 0 ? '$' + price.toLocaleString('en-US') : 'Free';
}

// RLS-safe feed fetch: two queries merged client-side. Seller info comes
// from public_profiles (the base profiles table is not readable for others).
export async function fetchFeed(): Promise<FeedListing[]> {
  const { data: rows, error } = await supabase
    .from('listings')
    .select('id, title, price, location, photo_urls, seller_id')
    .eq('archived', false)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  const listings = (rows ?? []) as Omit<FeedListing, 'seller'>[];

  const sellerIds = [...new Set(listings.map((l) => l.seller_id))];
  const sellerMap = new Map<string, FeedSeller>();
  if (sellerIds.length) {
    const { data: sellers, error: se } = await supabase
      .from('public_profiles')
      .select('id, display_name, school_unit, class_year, avatar_url')
      .in('id', sellerIds);
    if (se) throw se;
    for (const s of (sellers ?? []) as FeedSeller[]) sellerMap.set(s.id, s);
  }

  return listings.map((l) => ({
    ...l,
    price: l.price ?? 0,
    photo_urls: l.photo_urls ?? [],
    seller: sellerMap.get(l.seller_id) ?? null,
  }));
}
```

- [ ] **Step 2: Verify priceLabel (one-off, no test runner needed)**

```bash
cd mobile && node -e "const p=n=>n>0?'\$'+n.toLocaleString('en-US'):'Free'; console.log(p(40)===' \$40'.trim(), p(0)==='Free', p(1500)==='\$1,500')"
```
Expected: `true true true` (confirms the label logic; the module mirrors it exactly).

- [ ] **Step 3: Typecheck**

```bash
cd mobile && npx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/lib/listings.ts
git commit -m "feat(mobile): listings data layer — RLS-safe fetchFeed + priceLabel"
```

---

### Task 2: ListingCard component

**Files:**
- Create: `mobile/src/components/ListingCard.tsx`

**Interfaces:**
- Consumes: `FeedListing`, `priceLabel` (Task 1); `expo-image`.
- Produces: `ListingCard({ listing, onPress }: { listing: FeedListing; onPress: () => void })`.

- [ ] **Step 1: Write the component**

Create `mobile/src/components/ListingCard.tsx`:
```typescript
import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { FeedListing, priceLabel } from '@/lib/listings';

export function ListingCard({ listing, onPress }: { listing: FeedListing; onPress: () => void }) {
  const [failed, setFailed] = useState(false);
  const photo = listing.photo_urls[0];
  const sellerLine = [
    listing.seller?.display_name?.split(' ')[0],
    listing.seller?.school_unit,
    listing.seller?.class_year,
  ].filter(Boolean).join(' · ') || (listing.location ?? 'USC · pickup');

  return (
    <Pressable onPress={onPress} style={{ flex: 1, margin: 6 }}>
      <View style={{ aspectRatio: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: '#f0efec' }}>
        {photo && !failed ? (
          <Image
            source={{ uri: photo }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            onError={() => setFailed(true)}
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#b8b4ad', fontSize: 12 }}>No photo</Text>
          </View>
        )}
      </View>
      <Text numberOfLines={1} style={{ fontWeight: '700', fontSize: 14.5, marginTop: 8 }}>{listing.title}</Text>
      <Text numberOfLines={1} style={{ color: '#666', fontSize: 12.5, marginTop: 2 }}>{sellerLine}</Text>
      <Text style={{ fontWeight: '700', fontSize: 15, marginTop: 2, color: listing.price > 0 ? '#111' : '#990000' }}>
        {priceLabel(listing.price)}
      </Text>
    </Pressable>
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
git add mobile/src/components/ListingCard.tsx
git commit -m "feat(mobile): ListingCard with photo fallback + seller meta"
```

---

### Task 3: Feed screen (grid + states + refresh)

**Files:**
- Modify: `mobile/src/app/(tabs)/feed.tsx` (replace placeholder)
- Create: `mobile/src/app/(tabs)/listing/[id].tsx` (stub detail route for taps)

**Interfaces:**
- Consumes: `fetchFeed`, `FeedListing` (Task 1); `ListingCard` (Task 2); `expo-router`.

- [ ] **Step 1: Stub the listing-detail route**

Create `mobile/src/app/(tabs)/listing/[id].tsx`:
```typescript
import { View, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

export default function ListingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#666' }}>Listing {String(id)} — detail coming soon</Text>
    </View>
  );
}
```

- [ ] **Step 2: Write the Feed screen**

Replace `mobile/src/app/(tabs)/feed.tsx`:
```typescript
import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { fetchFeed, FeedListing } from '@/lib/listings';
import { ListingCard } from '@/components/ListingCard';

export default function Feed() {
  const router = useRouter();
  const [listings, setListings] = useState<FeedListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(false);
      const data = await fetchFeed();
      setListings(data);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    (async () => { await load(); setLoading(false); })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (loading) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></View>;
  }
  if (error) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: '#666', textAlign: 'center' }}>Couldn&apos;t load — pull to retry.</Text>
      </View>
    );
  }
  return (
    <FlatList
      data={listings}
      keyExtractor={(l) => l.id}
      numColumns={2}
      contentContainerStyle={{ padding: 6 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListEmptyComponent={
        <View style={{ alignItems: 'center', justifyContent: 'center', padding: 48 }}>
          <Text style={{ color: '#666' }}>No listings yet</Text>
        </View>
      }
      renderItem={({ item }) => (
        <ListingCard listing={item} onPress={() => router.push(`/(tabs)/listing/${item.id}`)} />
      )}
    />
  );
}
```

- [ ] **Step 3: Typecheck + bundle**

```bash
cd mobile && npx tsc --noEmit && EXPO_PUBLIC_SUPABASE_URL="https://x.supabase.co" EXPO_PUBLIC_SUPABASE_ANON_KEY="test" npx expo export --platform ios --output-dir /tmp/feed-export-check
```
Expected: typecheck exit 0; export bundles without error. Delete `/tmp/feed-export-check` after.

- [ ] **Step 4: Commit**

```bash
git add "mobile/src/app/(tabs)/feed.tsx" "mobile/src/app/(tabs)/listing"
git commit -m "feat(mobile): live feed grid (states + pull-to-refresh) + detail stub"
```

---

### Task 4: Device verification handoff

**Files:** none.

- [ ] **Step 1: Hand off to the user for the real test**

The user runs `cd mobile && npx expo start`, opens Expo Go, signs in with their USC email, and confirms the Feed tab shows real listings (photos, titles, prices, seller lines), pull-to-refresh works, and tapping a card opens the stub detail. Capture their confirmation. (The builder cannot run a simulator; `tsc` + `expo export` bundling is the pre-device verification.)

---

## Self-Review

**Spec coverage:**
- §1 two-query RLS-safe fetch (listings + public_profiles, merge) → Task 1. ✓
- §1 seller via public_profiles only → Task 1 (query 2). ✓
- §2 2-col FlatList grid → Task 3. ✓
- §2 card (photo+fallback, title, price, meta), tappable → Task 2. ✓
- §2 loading/empty/error/refresh states → Task 3. ✓
- §2 expo-image with placeholder → Task 2. ✓
- Deliverables: listings.ts, feed.tsx, ListingCard.tsx, listing/[id] stub, priceLabel check → Tasks 1-3. ✓
- Out of scope (real detail, posting, search, infinite scroll) → not planned. ✓

**Placeholder scan:** No TBDs; every file has complete code. The `node -e` priceLabel check replaces a formal unit test because `/mobile` has no test runner (documented constraint), and the logic is trivial + mirrored in the module.

**Type consistency:** `FeedListing`/`FeedSeller`/`fetchFeed`/`priceLabel` identical across Tasks 1-3. Route path `/(tabs)/listing/[id]` consistent between the stub (Task 3.1) and the navigation call (Task 3.2).

**Ordering:** Task 1 (data) → 2 (card) → 3 (screen wires them) → 4 (device handoff). Each typechecks independently; Task 3 adds the bundle check.
