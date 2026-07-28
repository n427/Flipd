# Expo App Scaffold + Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A runnable Flipd Expo app in `/mobile` that a USC student signs into with their `@usc.edu` email (OTP code flow), with an auth-gated tab navigation skeleton. No marketplace features.

**Architecture:** Expo (managed) + Expo Router + TypeScript + `@supabase/supabase-js` + `expo-secure-store`, in a `/mobile` subfolder isolated from the Next.js web app (Vercel never builds it). Direct-to-Supabase Auth OTP flow; USC-only enforced client-side AND by a DB trigger (migration 020). Verification: typecheck + bundle in this env, DB trigger on isolated Postgres, real sign-in by the user in Expo Go.

**Tech Stack:** Expo SDK (latest), Expo Router, React Native, TypeScript, Supabase JS, expo-secure-store, Postgres (trigger), local isolated Postgres for trigger tests.

## Global Constraints

- App is "Flipd", never "Tassel". No emojis; SVG/vector icons only. Terse.
- Service-role key NEVER on the client; only `EXPO_PUBLIC_SUPABASE_ANON_KEY` (public).
- USC-only (`@usc.edu`) enforced client-side AND by DB trigger. Regex: `^[^\s@]+@usc\.edu$`, case-insensitive, trimmed.
- The web app + its Vercel deploys must stay unaffected — `/mobile` is isolated and Vercel-ignored.
- Migration `020` (USC trigger) is GATED on explicit user approval; test on isolated local Postgres first (never touch the unrelated `dyrt-app` DB — use a throwaway database).
- `/mobile` is a separate package; copy `isUscEmail` in, do not import from web `src/`.

---

### Task 1: Scaffold the Expo project (isolated, Vercel-ignored)

**Files:**
- Create: `/mobile/*` (Expo project), `.vercelignore`

- [ ] **Step 1: Create the Expo app**

From the repo root:
```bash
npx create-expo-app@latest mobile --template default
```
(The `default` template includes Expo Router + TypeScript + a tabs example.) This installs into `/mobile`.

- [ ] **Step 2: Isolate from Vercel**

Create `.vercelignore` at repo root:
```
mobile
```
This ensures Vercel's Next.js build never includes the Expo project.

- [ ] **Step 3: Verify it builds/typechecks**

```bash
cd mobile && npx tsc --noEmit
```
Expected: exit 0 (fresh template is clean).

- [ ] **Step 4: Verify web app still unaffected**

From repo root: `npm run build` (the Next.js app) still succeeds and does not pick up `/mobile`.
Expected: web build succeeds; no reference to `/mobile`.

- [ ] **Step 5: Commit**

```bash
git add mobile .vercelignore
git commit -m "feat(mobile): scaffold Expo app in /mobile, Vercel-ignored"
```

---

### Task 2: Supabase client + secure session storage

**Files:**
- Create: `mobile/lib/supabase.ts`, `mobile/lib/usc.ts`, `mobile/.env` (gitignored), `mobile/app.config.ts` (or extend existing)

**Interfaces:**
- Produces: `supabase` (configured client) from `mobile/lib/supabase.ts`; `isUscEmail(email: string): boolean` from `mobile/lib/usc.ts`.

- [ ] **Step 1: Add deps**

```bash
cd mobile && npx expo install @supabase/supabase-js expo-secure-store @react-native-async-storage/async-storage
```

- [ ] **Step 2: Copy the USC check**

Create `mobile/lib/usc.ts`:
```typescript
// Copied from the web app's src/lib/validation.ts to keep both consistent.
export function isUscEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  return /^[^\s@]+@usc\.edu$/.test(e);
}
```

- [ ] **Step 3: Create the Supabase client with secure-store adapter**

Create `mobile/lib/supabase.ts`:
```typescript
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

// SecureStore has a 2KB value limit; Supabase sessions fit. Adapter shape
// matches Supabase's storage interface.
const SecureStorageAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: SecureStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // no magic-link URL handling; code flow only
  },
});
```
Run `npx expo install react-native-url-polyfill` if not already present.

- [ ] **Step 4: Env file**

Create `mobile/.env` (add `mobile/.env` to the repo `.gitignore`):
```
EXPO_PUBLIC_SUPABASE_URL=https://csjbfnbjwtvmtsudxukj.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<the anon key from web .env.local>
```
(Anon key is public/safe on-device. The URL + anon key are the same as the web app's `NEXT_PUBLIC_*` values.)

- [ ] **Step 5: Verify typecheck**

```bash
cd mobile && npx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 6: Commit** (do NOT commit `mobile/.env`)

```bash
git add mobile/lib mobile/package.json mobile/package-lock.json .gitignore
git commit -m "feat(mobile): supabase client with secure-store + USC check"
```

---

### Task 3: Session context + auth gate

**Files:**
- Create: `mobile/lib/session.tsx`
- Modify: `mobile/app/_layout.tsx`

**Interfaces:**
- Consumes: `supabase` (Task 2).
- Produces: `SessionProvider` + `useSession(): { session, user, loading }` from `mobile/lib/session.tsx`.

- [ ] **Step 1: Session context**

Create `mobile/lib/session.tsx`:
```typescript
import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

type Ctx = { session: Session | null; user: User | null; loading: boolean };
const SessionContext = createContext<Ctx>({ session: null, user: null, loading: true });

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  return (
    <SessionContext.Provider value={{ session, user: session?.user ?? null, loading }}>
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext);
```

- [ ] **Step 2: Wrap the root layout + gate routing**

Edit `mobile/app/_layout.tsx` to wrap the app in `SessionProvider` and redirect based on auth. Minimal shape:
```typescript
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { SessionProvider, useSession } from '../lib/session';

function Gate() {
  const { session, loading } = useSession();
  const segments = useSegments();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === '(auth)';
    if (!session && !inAuth) router.replace('/(auth)/sign-in');
    else if (session && inAuth) router.replace('/(tabs)/feed');
  }, [session, loading, segments]);
  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  return <SessionProvider><Gate /></SessionProvider>;
}
```

- [ ] **Step 3: Typecheck**

```bash
cd mobile && npx tsc --noEmit
```
Expected: exit 0 (routes referenced exist after Task 4/5; if the router complains about missing routes, proceed — they're created next, and the typecheck of TSX itself passes).

- [ ] **Step 4: Commit**

```bash
git add mobile/lib/session.tsx mobile/app/_layout.tsx
git commit -m "feat(mobile): session context + auth-gated routing"
```

---

### Task 4: Sign-in + code screens (direct OTP)

**Files:**
- Create: `mobile/app/(auth)/_layout.tsx`, `mobile/app/(auth)/sign-in.tsx`, `mobile/app/(auth)/verify.tsx`

**Interfaces:**
- Consumes: `supabase` (Task 2), `isUscEmail` (Task 2).

- [ ] **Step 1: Auth stack layout**

Create `mobile/app/(auth)/_layout.tsx`:
```typescript
import { Stack } from 'expo-router';
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

- [ ] **Step 2: Sign-in screen**

Create `mobile/app/(auth)/sign-in.tsx` — email input, `isUscEmail` client check, calls `signInWithOtp`, on success navigates to `verify` passing the email. Include rate-limit friendly handling and an "Already have a code?" link to `verify`. Complete component:
```typescript
import { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { isUscEmail } from '../../lib/usc';

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!isUscEmail(email)) { setError('Enter your @usc.edu email.'); return; }
    setBusy(true); setError('');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) {
      const rl = error.status === 429 || (error as any).code === 'over_email_send_rate_limit';
      setError(rl ? 'Too many emails just now — wait a minute, or tap “Already have a code?”' : 'Could not send the code. Try again.');
      return;
    }
    router.push({ pathname: '/(auth)/verify', params: { email: email.trim().toLowerCase() } });
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 28, fontWeight: '800' }}>flipd.</Text>
      <Text style={{ color: '#666' }}>Sign in with your USC email.</Text>
      <TextInput value={email} onChangeText={setEmail} placeholder="you@usc.edu"
        autoCapitalize="none" keyboardType="email-address" autoCorrect={false}
        style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, fontSize: 16 }} />
      {error ? <Text style={{ color: '#c00' }}>{error}</Text> : null}
      <Pressable onPress={submit} disabled={busy}
        style={{ backgroundColor: '#111', borderRadius: 10, padding: 16, alignItems: 'center', opacity: busy ? 0.6 : 1 }}>
        <Text style={{ color: '#fff', fontWeight: '700' }}>{busy ? 'Sending…' : 'Send code'}</Text>
      </Pressable>
      <Pressable onPress={() => router.push({ pathname: '/(auth)/verify', params: { email: email.trim().toLowerCase() } })}>
        <Text style={{ color: '#111', textAlign: 'center', textDecorationLine: 'underline' }}>Already have a code?</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 3: Verify (code) screen**

Create `mobile/app/(auth)/verify.tsx` — 6-8 digit input, calls `verifyOtp`; on success the session listener flips and the gate routes to tabs. Complete component:
```typescript
import { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';

export default function Verify() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!/^\d{6,8}$/.test(code.trim())) { setError('Enter the 6-digit code from your email.'); return; }
    setBusy(true); setError('');
    const { error } = await supabase.auth.verifyOtp({ email: String(email), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) { setError('That code is invalid or expired — request a new one.'); return; }
    // On success, onAuthStateChange fires and the root gate routes to (tabs).
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: '800' }}>Enter your code</Text>
      <Text style={{ color: '#666' }}>Sent to {String(email)}</Text>
      <TextInput value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 8))}
        placeholder="123456" keyboardType="number-pad"
        style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, fontSize: 20, letterSpacing: 4 }} />
      {error ? <Text style={{ color: '#c00' }}>{error}</Text> : null}
      <Pressable onPress={submit} disabled={busy}
        style={{ backgroundColor: '#111', borderRadius: 10, padding: 16, alignItems: 'center', opacity: busy ? 0.6 : 1 }}>
        <Text style={{ color: '#fff', fontWeight: '700' }}>{busy ? 'Verifying…' : 'Verify'}</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 4: Typecheck**

```bash
cd mobile && npx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add "mobile/app/(auth)"
git commit -m "feat(mobile): USC OTP sign-in + code verify screens"
```

---

### Task 5: Tab navigator with placeholder screens

**Files:**
- Create: `mobile/app/(tabs)/_layout.tsx`, `mobile/app/(tabs)/feed.tsx`, `post.tsx`, `requests.tsx`, `profile.tsx`
- Remove: the template's example tab screens if they conflict (`mobile/app/(tabs)/index.tsx` etc. from the default template).

**Interfaces:**
- Consumes: `useSession` (Task 3), `supabase` (Task 2, for sign-out).

- [ ] **Step 1: Tab layout**

Create `mobile/app/(tabs)/_layout.tsx` with four tabs (Feed, Post, Requests, Profile) using `@expo/vector-icons` (Ionicons). No emojis.
```typescript
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#111', headerShown: true }}>
      <Tabs.Screen name="feed" options={{ title: 'Feed', tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="post" options={{ title: 'Post', tabBarIcon: ({ color, size }) => <Ionicons name="add-circle-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="requests" options={{ title: 'Requests', tabBarIcon: ({ color, size }) => <Ionicons name="notifications-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" color={color} size={size} /> }} />
    </Tabs>
  );
}
```

- [ ] **Step 2: Placeholder screens**

Create each of `feed.tsx`, `post.tsx`, `requests.tsx` as a simple centered placeholder, e.g. `feed.tsx`:
```typescript
import { View, Text } from 'react-native';
export default function Feed() {
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#666' }}>Feed — coming soon</Text></View>;
}
```
(`post.tsx`, `requests.tsx` identical with their own label.)

- [ ] **Step 3: Profile screen (shows user + sign-out)**

Create `mobile/app/(tabs)/profile.tsx`:
```typescript
import { View, Text, Pressable } from 'react-native';
import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';

export default function Profile() {
  const { user } = useSession();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <Text style={{ fontSize: 16 }}>Signed in as</Text>
      <Text style={{ fontWeight: '700' }}>{user?.email ?? '—'}</Text>
      <Pressable onPress={() => supabase.auth.signOut()}
        style={{ backgroundColor: '#111', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24 }}>
        <Text style={{ color: '#fff', fontWeight: '700' }}>Sign out</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 4: Remove template example screens**

Delete any leftover default-template tab files that aren't feed/post/requests/profile (e.g. `index.tsx`, `explore.tsx`) so routing is clean. Verify `mobile/app/(tabs)/` contains only `_layout.tsx` + the four screens.

- [ ] **Step 5: Typecheck + bundle check**

```bash
cd mobile && npx tsc --noEmit && npx expo export --platform ios --output-dir /tmp/expo-export-check
```
Expected: typecheck exit 0; export/bundle completes without error (proves the app bundles). Delete `/tmp/expo-export-check` after.

- [ ] **Step 6: Commit**

```bash
git add "mobile/app/(tabs)"
git commit -m "feat(mobile): auth-gated tab shell (Feed/Post/Requests/Profile) + sign-out"
```

---

### Task 6: USC-only DB trigger (migration 020)

**Files:**
- Create: `supabase/migrations/020_usc_only_signup.sql`, `supabase/tests/020_usc_only_signup.test.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/020_usc_only_signup.sql`:
```sql
-- Enforce USC-only signup at the database layer (defense in depth; the app
-- also checks client-side, but that is bypassable). Blocks any auth.users
-- insert whose email doesn't match @usc.edu.
create or replace function public.enforce_usc_email()
  returns trigger language plpgsql as $$
begin
  if new.email is null or lower(new.email) !~ '^[^\s@]+@usc\.edu$' then
    raise exception 'Flipd is USC-only: email must be a @usc.edu address';
  end if;
  return new;
end $$;

drop trigger if exists trg_enforce_usc_email on auth.users;
create trigger trg_enforce_usc_email
  before insert on auth.users
  for each row execute function public.enforce_usc_email();
```

- [ ] **Step 2: Write the test (isolated Postgres)**

Create `supabase/tests/020_usc_only_signup.test.sql` — asserts a `@usc.edu` insert succeeds and a non-USC insert raises. It builds a minimal `auth.users(email text)` skeleton so it runs standalone:
```sql
-- Run against a THROWAWAY database. Verifies the USC-only trigger.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
-- (apply 020 migration's function+trigger before this file)

do $$ begin
  insert into auth.users (email) values ('trojan@usc.edu');
  raise notice 'PASS: usc.edu insert allowed';
exception when others then raise notice 'FAIL: usc.edu insert blocked (%)', sqlerrm; end $$;

do $$ begin
  insert into auth.users (email) values ('someone@gmail.com');
  raise notice 'FAIL: non-USC insert allowed (should be blocked)';
exception when others then raise notice 'PASS: non-USC insert blocked (%)', sqlerrm; end $$;

do $$ begin
  insert into auth.users (email) values ('Trojan@USC.EDU');
  raise notice 'PASS: case-insensitive usc.edu allowed';
exception when others then raise notice 'FAIL: uppercase usc.edu blocked (%)', sqlerrm; end $$;
```

- [ ] **Step 3: Run the trigger test on an isolated local Postgres**

Use the local Postgres on 127.0.0.1:54322 (the running stack) but a THROWAWAY database — never the `postgres` db that holds the unrelated `dyrt-app` data:
```bash
export PGPASSWORD=postgres
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "drop database if exists flipd_trg_check;" 
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "create database flipd_trg_check;"
# skeleton auth.users, then the migration function/trigger, then the tests:
psql -h 127.0.0.1 -p 54322 -U postgres -d flipd_trg_check -c "create schema if not exists auth; create table auth.users (id uuid primary key default gen_random_uuid(), email text);"
psql -h 127.0.0.1 -p 54322 -U postgres -d flipd_trg_check -v ON_ERROR_STOP=1 -f supabase/migrations/020_usc_only_signup.sql
psql -h 127.0.0.1 -p 54322 -U postgres -d flipd_trg_check -f supabase/tests/020_usc_only_signup.test.sql
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "drop database flipd_trg_check;"
```
Expected NOTICES: `PASS: usc.edu insert allowed`, `PASS: non-USC insert blocked`, `PASS: case-insensitive usc.edu allowed`. Confirm the unrelated DB is untouched.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/020_usc_only_signup.sql supabase/tests/020_usc_only_signup.test.sql
git commit -m "feat: USC-only signup DB trigger (migration 020) + isolated test"
```

---

### Task 7: README + end-to-end handoff (GATED prod apply)

**Files:**
- Create: `mobile/README.md`

- [ ] **Step 1: Write run instructions**

Create `mobile/README.md` covering: prerequisites (Node, Expo Go app on phone), env setup (`mobile/.env` with the two `EXPO_PUBLIC_*` vars), `cd mobile && npx expo start`, scanning the QR with Expo Go, and the sign-in flow. Note that email delivery uses the same Supabase+Resend as the web app.

- [ ] **Step 2: Present the migration-020 gate**

Show the user migration 020 + its passing isolated tests. Migration 020 alters `auth.users` on production — GATED. Ask for explicit approval to apply (via Supabase SQL editor or MCP). Do NOT apply without it.

- [ ] **Step 3: User runs the app (real end-to-end)**

The user runs `npx expo start` in `/mobile`, opens Expo Go, signs in with their USC email, receives the code, and lands on the tabs. This is the real verification (needs a device + USC email). Capture their confirmation.

- [ ] **Step 4: Commit**

```bash
git add mobile/README.md
git commit -m "docs(mobile): run instructions + Expo Go handoff"
```

---

## Self-Review

**Spec coverage:**
- §1 project setup / `/mobile` / Vercel isolation → Task 1. ✓
- Supabase client + secure-store + env → Task 2. ✓
- USC client check (`isUscEmail` copied) → Task 2. ✓
- Session context + auth gate → Task 3. ✓
- OTP sign-in + code screens + rate-limit handling → Task 4. ✓
- Tab shell (Feed/Post/Requests/Profile placeholders) + sign-out → Task 5. ✓
- USC DB trigger (migration 020) + isolated test → Task 6. ✓
- README + Expo Go handoff + gated prod apply → Task 7. ✓
- Out-of-scope (marketplace features, image/map/reveals, push, app-store) → not planned. ✓

**Placeholder scan:** No TBDs; every screen/file has complete code. Task 5 export-check is a concrete bundle verification.

**Type/name consistency:** `supabase`, `isUscEmail`, `useSession`/`SessionProvider`, route paths (`/(auth)/sign-in`, `/(auth)/verify`, `/(tabs)/feed`) consistent across tasks. `EXPO_PUBLIC_SUPABASE_URL`/`_ANON_KEY` used identically in Task 2 and README.

**Known constraint:** Expo simulators can't run in this environment — app verification is typecheck + `expo export` bundle; real sign-in is the user's Expo Go run (Task 7). The DB trigger IS fully verified on isolated Postgres. Production migration 020 is gated.

**Ordering:** Tasks 1→5 build the app incrementally (each typechecks). Task 6 (trigger) is independent and can run anytime. Task 7 is the handoff + gate.
