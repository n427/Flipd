# Flipd — Mobile App

Native (Expo / React Native) app for Flipd, the USC student marketplace. It
shares the **same Supabase backend** as the web app (`flipdcampus.com`) — this
is a separate frontend, not a replacement. The web app is unaffected by
anything in this folder.

## Status

Sub-project 2 of 3: **scaffold + auth**. What works today:

- USC-only sign-in via one-time **code** (OTP) sent to your `@usc.edu` email
  (same scanner-safe flow as the web app — no magic link).
- Auth-gated tab shell: **Feed / Post / Requests / Profile** (placeholders for
  now; real features are sub-project 3). Profile shows your email + sign-out.

## Prerequisites

- Node 18+ and this repo cloned.
- The **Expo Go** app on your phone (App Store / Play Store), OR an iOS
  simulator / Android emulator.
- A `@usc.edu` email you can receive mail at.

## Setup

1. Install deps:
   ```bash
   cd mobile
   npm install
   ```
2. Create `mobile/.env` (gitignored) with the **public** Supabase values —
   the same ones the web app uses as `NEXT_PUBLIC_SUPABASE_URL` /
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the anon key is safe on-device; never put
   the service-role key here):
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   ```

## Run

```bash
cd mobile
npx expo start
```

Then:
- **Phone:** open Expo Go and scan the QR code shown in the terminal.
- **Simulator:** press `i` (iOS) or `a` (Android) in the Expo terminal.

Sign in with your `@usc.edu` email -> you'll get a numeric code by email
(delivered by the same Supabase + Resend SMTP the web app uses) -> enter it ->
you land on the tabs.

## Notes

- **Data access:** the app talks directly to Supabase using the anon key.
  Row-Level Security (migration `019`) is what makes this safe — the app can
  only read/write what the policies allow. Reveal *writes* (approve/decline)
  will go through server API routes in a later sub-project.
- **USC-only** is enforced two ways: a client check here, and a database
  trigger (migration `020`) that rejects non-`@usc.edu` signups even if the
  client is bypassed.
- **Isolated from the web app:** `/mobile` is Vercel-ignored and excluded from
  the web app's TypeScript build. Nothing here affects `flipdcampus.com`.

## Structure

```
src/
  app/
    _layout.tsx        # root layout + auth gate (session-based redirect)
    (auth)/
      _layout.tsx
      sign-in.tsx      # email + "send code"
      verify.tsx       # enter the OTP code
    (tabs)/
      _layout.tsx      # Feed/Post/Requests/Profile tab bar
      feed.tsx post.tsx requests.tsx profile.tsx
  lib/
    supabase.ts        # Supabase client (secure-store session)
    session.tsx        # SessionProvider + useSession()
    usc.ts             # isUscEmail() (copied from web to stay consistent)
```
