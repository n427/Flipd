# Mobile Profile Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the placeholder Profile tab with the user's header (avatar/name/unit-year/bio), a grid of their own listings, and sign out.

**Architecture:** `fetchMyProfile` + `fetchMyListings` (own-row reads under RLS) in `lib/listings.ts`; `profile.tsx` renders header + `ListingCard` grid + sign out.

**Tech Stack:** Expo Router, React Native, `@supabase/supabase-js`, `expo-image`, TypeScript.

## Global Constraints

- App is "Flipd", never "Tassel". No emojis. Terse.
- Own profile via `profiles_select_own`; own listings via `listings_select_own_archived`. Direct-to-Supabase.
- Reuse `ListingCard` + `FeedListing`; no duplicate card.
- Verification: `cd mobile && npx tsc --noEmit` + `npx expo export`; column shapes vs live schema; device test.
- `/mobile` isolated; web unaffected.

---

### Task 1: `fetchMyProfile` + `fetchMyListings`

**Files:**
- Modify: `mobile/src/lib/listings.ts`

**Interfaces:**
- Produces: `type MyProfile`, `fetchMyProfile(userId): Promise<MyProfile | null>`, `fetchMyListings(userId): Promise<FeedListing[]>`.

- [ ] **Step 1: Append the functions**

Append to `mobile/src/lib/listings.ts`:
```typescript
export type MyProfile = {
  id: string;
  display_name: string | null;
  school_unit: string | null;
  class_year: string | null;
  bio: string | null;
  avatar_url: string | null;
};

export async function fetchMyProfile(userId: string): Promise<MyProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, school_unit, class_year, bio, avatar_url')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as MyProfile) ?? null;
}

export async function fetchMyListings(userId: string): Promise<FeedListing[]> {
  const { data, error } = await supabase
    .from('listings')
    .select('id, title, price, location, photo_urls, seller_id')
    .eq('seller_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Omit<FeedListing, 'seller'>[]).map((l) => ({
    ...l,
    price: l.price ?? 0,
    photo_urls: l.photo_urls ?? [],
    seller: null,
  }));
}
```

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/lib/listings.ts
git commit -m "feat(mobile): fetchMyProfile + fetchMyListings (own-row reads)"
```

---

### Task 2: The Profile screen

**Files:**
- Modify: `mobile/src/app/(tabs)/profile.tsx` (replace placeholder)

**Interfaces:**
- Consumes: `fetchMyProfile`, `fetchMyListings`, `MyProfile`, `FeedListing` (Task 1); `ListingCard`; `useSession`; `supabase`; `expo-image`, `expo-router`.

- [ ] **Step 1: Write the screen**

Replace `mobile/src/app/(tabs)/profile.tsx`:
```typescript
import { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { fetchMyProfile, fetchMyListings, MyProfile, FeedListing } from '@/lib/listings';
import { ListingCard } from '@/components/ListingCard';

export default function Profile() {
  const router = useRouter();
  const { user } = useSession();
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [listings, setListings] = useState<FeedListing[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [p, l] = await Promise.all([fetchMyProfile(user.id), fetchMyListings(user.id)]);
        setProfile(p);
        setListings(l);
        setState('ready');
      } catch {
        setState('error');
      }
    })();
  }, [user]);

  if (state === 'loading') return <View style={c.center}><ActivityIndicator /></View>;

  const unitYear = [profile?.school_unit, profile?.class_year].filter(Boolean).join(' · ');

  return (
    <FlatList
      data={listings}
      keyExtractor={(l) => l.id}
      numColumns={2}
      contentContainerStyle={{ padding: 6 }}
      ListHeaderComponent={
        <View style={{ padding: 10, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {profile?.avatar_url
              ? <Image source={{ uri: profile.avatar_url }} style={{ width: 56, height: 56, borderRadius: 28 }} contentFit="cover" />
              : <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#eee' }} />}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '800' }}>{profile?.display_name ?? user?.email ?? 'You'}</Text>
              {unitYear ? <Text style={{ color: '#666' }}>{unitYear}</Text> : null}
            </View>
          </View>
          {profile?.bio ? <Text style={{ color: '#333' }}>{profile.bio}</Text> : null}
          {state === 'error' ? <Text style={{ color: '#c00' }}>Couldn&apos;t load your profile.</Text> : null}
          <Pressable onPress={() => supabase.auth.signOut()} style={{ alignSelf: 'flex-start', backgroundColor: '#111', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20, marginTop: 4 }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Sign out</Text>
          </Pressable>
          <Text style={{ fontWeight: '700', fontSize: 15, marginTop: 12 }}>My Listings</Text>
        </View>
      }
      ListEmptyComponent={
        state === 'ready'
          ? <View style={{ padding: 24 }}><Text style={{ color: '#666' }}>You haven&apos;t posted anything yet.</Text></View>
          : null
      }
      renderItem={({ item }) => (
        <ListingCard listing={item} onPress={() => router.push(`/(tabs)/listing/${item.id}`)} />
      )}
    />
  );
}

const c = { center: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const } };
```

- [ ] **Step 2: Typecheck + bundle**

```bash
cd mobile && npx tsc --noEmit && EXPO_PUBLIC_SUPABASE_URL="https://x.supabase.co" EXPO_PUBLIC_SUPABASE_ANON_KEY="test" npx expo export --platform ios --output-dir /tmp/profile-export-check
```
Expected: typecheck exit 0; bundle succeeds. Delete `/tmp/profile-export-check`.

- [ ] **Step 3: Verify column shapes vs live schema (service-role, shape only)**

```bash
cd "$(git rev-parse --show-toplevel)" && node -e "
const {createClient}=require('./node_modules/@supabase/supabase-js');
const fs=require('fs');
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]}));
const a=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
  const p=await a.from('profiles').select('id, display_name, school_unit, class_year, bio, avatar_url').limit(1);
  console.log('profiles cols:', p.error?('ERROR '+p.error.message):'OK');
  const l=await a.from('listings').select('id, title, price, location, photo_urls, seller_id').limit(1);
  console.log('listings cols:', l.error?('ERROR '+l.error.message):'OK');
})();
"```
Expected: `profiles cols: OK`, `listings cols: OK`.

- [ ] **Step 4: Commit**

```bash
git add "mobile/src/app/(tabs)/profile.tsx"
git commit -m "feat(mobile): profile screen — header, own listings, sign out"
```

---

### Task 3: Device verification handoff

**Files:** none.

- [ ] **Step 1: Hand off**

User signs in, opens the Profile tab, and confirms: the header shows their avatar/name/unit-year/bio, their own listings appear in the grid (tap opens detail), the empty state shows if none, and sign out works. Capture confirmation.

---

## Self-Review

**Spec coverage:**
- §1 fetchMyProfile (own row) + fetchMyListings (own) → Task 1. ✓
- §2 header (avatar/name/unit-year/bio) → Task 2. ✓
- §2 own listings grid via ListingCard + empty state → Task 2. ✓
- §2 sign out + loading/error → Task 2. ✓
- Out of scope (saved/activity/reviews/edit/avatar upload) → not planned. ✓

**Placeholder scan:** No TBDs; complete screen code. Shape check validates columns against live schema (read-only, no writes).

**Type consistency:** `MyProfile`, `fetchMyProfile`, `fetchMyListings`, `FeedListing`, `ListingCard` consistent; route `/(tabs)/listing/[id]` matches feed/detail usage.

**Ordering:** Task 1 (data) → Task 2 (screen) → Task 3 (device). Each typechecks; Task 2 adds bundle + shape checks.
