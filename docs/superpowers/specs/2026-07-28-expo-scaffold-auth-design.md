# Expo App Scaffold + Auth — Design

**Date:** 2026-07-28
**Status:** Approved (design), pending implementation plan
**Context:** Sub-project 2 of 3 toward a native Flipd mobile app. Sub-project 1 (RLS policy layer, migration 019) is done and live — the mobile app can safely talk directly to Supabase. This sub-project produces a **runnable app you can sign into**; the marketplace screens are sub-project 3. The existing Next.js web app (`flipdcampus.com`) is unaffected throughout.

## Goal

A Flipd Expo app in `/mobile` that a USC student can sign into with their `@usc.edu` email (OTP code flow), with an auth-gated tab navigation skeleton ready for real screens. No marketplace features yet.

## Section 1 — Project setup & structure

- **Location:** `/mobile` subfolder in the existing repo (`n427/Flipd`). Self-contained Expo project (own `package.json`, `node_modules`). The web app's tooling does not touch it.
- **Vercel isolation:** add a `.vercelignore` (or confirm build settings) so Vercel only ever builds the Next.js root and never attempts to build `/mobile`. Protects live web deploys.
- **Stack:** Expo (managed workflow), **Expo Router** (file-based routing), TypeScript, `@supabase/supabase-js`, `expo-secure-store` for session-token storage (native keychain).
- **Env:** app reads `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` (public, safe on-device). The service-role key is NEVER on the client.

## Section 2 — USC sign-in (direct to Supabase Auth)

Mirrors the web app's scanner-safe OTP-**code** flow (no magic link — USC mail scanners consume links).

1. **Sign-in screen:** email input; client validates `@usc.edu` (reuse the `isUscEmail` regex/logic). Submit → `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })` → Supabase emails a 6-8 digit code via the (now working) Resend SMTP.
2. **Code screen:** 6-8 digit input → `supabase.auth.verifyOtp({ email, token, type: 'email' })`. On success, Supabase JS persists the session in `expo-secure-store` automatically.
3. **Session:** a session context provider built on `supabase.auth.onAuthStateChange` exposes `user` / `loading`. Router redirects signed-out → `(auth)`, signed-in → `(tabs)`.

**USC gate — two layers:**
- **Client:** `@usc.edu` check in the sign-in UI (fast feedback; bypassable).
- **Database trigger (real enforcement):** migration `020` adds a BEFORE INSERT trigger on `auth.users` that raises an exception for any email not matching `@usc.edu`. Cannot be bypassed, even by a direct API call. Verified on isolated local Postgres.

**Rate-limit handling:** the sign-in screen surfaces a friendly message on a 429 / `over_email_send_rate_limit` and offers an "already have a code?" path to the code screen (mirrors the web fix).

**Sign-out:** `supabase.auth.signOut()` clears secure-store; router returns to sign-in. **Deep-linking:** not required (code flow has no link to catch).

## Section 3 — Navigation shell, testing, deliverables

**Navigation (Expo Router + tabs):**
- Root `_layout.tsx` reads session context: signed-out → `(auth)` stack (sign-in → code); signed-in → `(tabs)`.
- Bottom tabs matching the web structure: **Feed · Post · Requests · Profile**, each a **placeholder** screen (label + signed-in user's email) — navigable skeleton, no features.
- Brand-consistent: "Flipd" wordmark, no emojis, SVG/vector icons.

**Testing (honest about mobile constraints):**
- Pure logic (`isUscEmail` reuse, helpers) → unit tests.
- DB trigger → verified on isolated local Postgres (non-USC insert rejected; USC insert succeeds), same method as the RLS work.
- The app → verified by `expo` typecheck + bundle succeeding in this environment; **end-to-end sign-in is run by the user in Expo Go** on their phone (needs a real device + USC email + receiving the code). Exact steps documented.

**Deliverables:**
1. `/mobile` Expo project (Router, TS, Supabase client, secure-store, Vercel-ignored).
2. Sign-in + code screens: direct OTP flow, USC client check, rate-limit handling.
3. Session context + auth-gated tab navigator with 4 placeholder screens.
4. Migration `020` — USC-only `auth.users` trigger (tested on isolated Postgres; production apply GATED on explicit approval, like 019).
5. `/mobile/README.md` with run steps (Expo Go, env setup).

## Global constraints

- App is "Flipd", never "Tassel". No emojis; SVG/vector icons only. Terse.
- Service-role key never on the client; only the anon key (public).
- USC-only (`@usc.edu`) enforced client-side AND by DB trigger.
- The existing web app and its Vercel deploys must remain unaffected (`/mobile` isolated).
- Reuse `isUscEmail` logic. NOTE: `/mobile` is a separate package and cannot import the web app's `src/`; copy the same 3-line `isUscEmail` implementation into `/mobile` (identical regex `^[^\s@]+@usc\.edu$`, case-insensitive, trimmed) so both stay consistent.
- Production DB change (migration 020) is GATED on explicit user approval; test on isolated Postgres first.

## Out of scope (sub-project 3)

Feed / Post / Requests / Profile real features, image upload (native picker), the map, reveal flows (send/approve — these use token-authed API routes, added when needed), push notifications, ratings/reports/blocks UI, app-store submission (Apple/Google accounts + review).
