# Local dev: Next.js web + Expo on web

**Date:** 2026-08-06
**Status:** Approved

## Goal

Run both Flipd front ends locally against the existing hosted Supabase project:

- Next.js web app on `localhost:3000`
- Expo app rendered through react-native-web on `localhost:8081`

## Context

The app is already built on both platforms — 12 web routes, 20 API routes, 24 Expo
screens. Dependencies are installed in both trees and the hosted Supabase project has
all 29 migrations applied. Nothing blocks local dev except missing environment files.

### Why browser, not simulator or device

The machine has Command Line Tools but no `Xcode.app`, so `xcrun simctl` does not
exist and the iOS Simulator cannot run. The Simulator ships only inside Xcode;
simulator runtimes are not separately installable.

Native device builds were considered and rejected:

- A free Apple ID can sideload to a personal device, but only by compiling locally
  in Xcode — which is absent.
- EAS cloud build removes the Xcode requirement, but iOS internal distribution needs
  a distribution certificate and provisioning profile, which Apple issues only to
  paid Developer Program members.

The decision is to use a free personal Apple ID, so both native paths are closed.
Expo web is the remaining option and is sufficient for the goal.

## Scope

Configuration and verification. No feature work.

**Out of scope:** push notifications (requires a native build), EAS, TestFlight,
App Store submission, Xcode.

## Components

### 1. Environment files

Create `.env.local` (web) and `mobile/.env` (mobile). Both paths are already
gitignored — `.gitignore:9` and `mobile/.gitignore:44`.

| Purpose | Web | Mobile |
| --- | --- | --- |
| Supabase URL | `NEXT_PUBLIC_SUPABASE_URL` | `EXPO_PUBLIC_SUPABASE_URL` |
| Supabase anon key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `EXPO_PUBLIC_SUPABASE_ANON_KEY` |
| Service role key | `SUPABASE_SERVICE_ROLE_KEY` | — |
| Maps | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` |
| Places | — | `EXPO_PUBLIC_GOOGLE_PLACES_KEY` |
| Optional | `RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET` | — |

Secret values are pasted in by the user, not transmitted through the session.
`SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security entirely, defeating every
policy in `019_rls_policies.sql`; it should not appear in a chat transcript.

`.env.local.example` and `mobile/.env.example` are currently untracked. Commit them
so required configuration is documented for anyone cloning the repo.

Without `RESEND_API_KEY`, `src/lib/notify.ts` logs sends instead of dispatching them,
so email is exercised in development without a provider.

### 2. Web dev server

`npm run dev`. Verify the feed renders, auth completes, and API routes respond.

### 3. Expo on web

`npx expo start --web` on port 8081. No conflict with the Next.js server on 3000.

### 4. Web-incompatibility triage

Two native modules already handle web and need no work:

- `expo-secure-store` — `mobile/src/lib/supabase.ts` swaps in a `localStorage`
  adapter when `Platform.OS === 'web'`.
- `expo-notifications` — `mobile/src/lib/push.ts` returns early on web.

**Verified 2026-08-06:** the web bundle compiles cleanly — Metro bundled 1585 modules
for the client and 1461 for server render with no module-resolution failures. Every
native dependency (`expo-video`, `expo-image-picker`, `react-native-reanimated`,
`expo-secure-store`) resolved a web implementation. The only bundle error was the
placeholder Supabase URL.

Compiling is not the same as behaving, so these remain suspect at runtime:
`expo-image-picker` (maps to a file input; crop and focal-point UI may misbehave),
`expo-video` (partial web support), `react-native-reanimated` (functional but janky
on gesture-heavy screens), and `LocationPicker` if no Google Maps key is supplied.

**Triage rule: fix only what blocks navigation or authentication.** Record anything
else as a known limitation and move on.

The rationale is that Expo web is a development convenience here, not a shipped
target — the real web product is the separate Next.js app in `src/`. Each
`Platform.OS === 'web'` branch added for a platform that is never shipped is
permanent complexity bought for temporary convenience. The `supabase.ts` adapter
earns its branch because auth is load-bearing on every screen; a crop-tool shim for
a browser preview would not. A screen unusable in the browser is a signal to test it
on a real device later, not to build a web shim for it.

## Success criteria

1. `localhost:3000` serves the Next.js app; sign-in succeeds against hosted Supabase.
2. `localhost:8081` serves the Expo app; sign-in succeeds and tabs navigate.
3. Neither `.env.local` nor `mobile/.env` is tracked by git.
4. Both `.example` files are committed.
5. Web-incompatible screens are documented as known limitations.
