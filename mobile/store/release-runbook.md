# TestFlight and App Store Release Runbook

This is an operator checklist. Automated source gates can be recorded here; Apple-account, production-service, and physical-device gates remain unchecked until a human performs them against the exact submitted build.

## 1. Source and production configuration

- [ ] Merge the reviewed mobile release branch.
- [ ] Deploy database migrations `036_legal_acceptance.sql`, `037_account_deletion.sql`, and `038_thread_reports.sql` to production.
- [ ] Deploy the web API containing `DELETE /api/me/delete` and conversation reporting before distributing the matching mobile build.
- [ ] Confirm production `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, maps/places configuration, web API origin, EAS project ID, and push credentials.
- [ ] Confirm no service-role key, Apple credential, review credential, or private token is present in the mobile bundle or repository.
- [ ] Decide iPhone-only versus iPad support from the generated native target.
- [ ] Increment iOS build number; retain marketing version `1.0.0` for the first release.

## 2. Automated source gates

- [ ] Full root Vitest suite.
- [ ] Root TypeScript, ESLint, production build, and production dependency audit.
- [ ] Mobile TypeScript and Expo lint.
- [ ] Expo Doctor.
- [ ] `npm run store:validate` from `mobile/`.
- [ ] Public Expo config contains the branded splash, camera/photo usage descriptions, bundle ID, version, and encryption declaration.
- [ ] Production iOS Expo export succeeds using production-shaped public environment variables.
- [ ] Git diff and secret/large-file checks are clean.

Record fresh evidence in **Verification evidence** below immediately before submission.

## 3. Production build

From `mobile/`, authenticate to the correct Expo organization and run:

```bash
eas build --platform ios --profile production
```

- [ ] Distribution signing succeeds.
- [ ] App Store Connect processes the build without icon, privacy manifest, entitlement, or architecture warnings.
- [ ] Select the processed build for internal TestFlight.

## 4. TestFlight device pass

- [ ] Fresh install and upgrade install both launch with the branded splash.
- [ ] OTP sign-in and session restoration work on production services.
- [ ] New and existing users complete current Terms/Privacy acceptance correctly.
- [ ] Feed, search, filters, listing detail, saves, requests, approvals, messages, and attachments work.
- [ ] Camera and photo prompts use the declared copy and denial has a usable fallback.
- [ ] Flipd’s notification explainer appears before Apple’s prompt; Not now and Settings paths work.
- [ ] Push delivery opens the correct Requests destination from foreground, background, and cold start.
- [ ] SecureStore keeps the intended account signed in and removes the session on sign-out/deletion.
- [ ] Listing, profile, and conversation reports reach the production moderation queue.
- [ ] Blocking prevents further contact and hides the expected marketplace activity.
- [ ] Account deletion removes access, public identity/content, storage media, and push tokens; retained rows are anonymized.
- [ ] Keyboard, safe-area, back gesture, rotation policy, and largest supported device layouts are correct.

## 5. Accessibility Nutrition Labels and device checks

- [ ] VoiceOver: every primary control has a meaningful name, role, state, and focus order.
- [ ] Larger Text/Dynamic Type: no clipped controls or inaccessible fixed-height content.
- [ ] Voice Control: tappable controls have distinct speakable names.
- [ ] Sufficient Contrast and Differentiate Without Color Alone are checked across primary flows.
- [ ] Reduced Motion behavior remains usable.
- [ ] Declare only the accessibility features that pass Apple’s current evaluation criteria in the submitted build.

## 6. Store assets and information

- [ ] Capture the five real screenshots in `screenshots.md` at one accepted 6.9-inch size.
- [ ] Enter validated metadata and public URLs.
- [ ] Complete and publish the privacy answers from `privacy-labels.md` after production SDK verification.
- [ ] Complete the live age-rating questionnaire and apply an 18+ override if needed to match Flipd’s Terms.
- [ ] Confirm content rights for every screenshot and seeded listing image.
- [ ] Confirm export compliance; `ITSAppUsesNonExemptEncryption` is false only if the submitted binary qualifies.
- [ ] Add review contact and dedicated review credentials privately in App Store Connect.
- [ ] Paste and re-check the review notes against the final build.
- [ ] Select manual release for the first launch.

## 7. Submit and release

- [ ] Submit the processed build and required metadata to App Review.
- [ ] Respond to App Review questions using the same review account and documented paths.
- [ ] After approval, run one final production smoke test before manual release.
- [ ] Monitor authentication, deletion failures, reports, crashes, and push delivery after launch.

## Verification evidence

Recorded 2026-08-20 against source commit `b390c9b` on
`feature/mobile-app-store-readiness`:

- `npm test && npx tsc --noEmit && npm run lint && npm run build` at the repository root exited successfully: 22 test files and 172 tests passed, TypeScript and ESLint passed, and the Next.js production build completed.
- `npm test && npx tsc --noEmit && npm run lint && npm run store:validate && npx expo-doctor` in `mobile/` exited successfully: 8 test files and 35 tests passed, TypeScript and Expo lint passed, all six store documents validated, and Expo Doctor passed 18/18 checks.
- `npx expo config --type public --json` confirmed app version `1.0.0`, bundle ID `com.flipd.app`, branded icon/splash configuration, camera/photo usage descriptions, and `ITSAppUsesNonExemptEncryption: false`.
- `npx expo export --platform ios` succeeded with production-shaped placeholder public environment variables at `/tmp/flipd-final-export.6BFZWD`. This proves bundling only; it does not validate real production credentials or services.
- Root `npm audit --omit=dev` reported 0 vulnerabilities. Mobile `npm audit --omit=dev` reported 27 transitive findings (14 moderate, 13 high); the available npm remediations require an Expo SDK major upgrade and must be handled as a separately tested upgrade rather than a forced pre-release change. The full mobile audit reported one additional moderate development-only finding through `@expo/ngrok`.
- `git diff --check` passed. The tracked-file credential-pattern scan found only environment-variable names/examples and server-side references, not committed values. The largest tracked file was 581 KB; no unexpectedly large release artifact was found.

Remaining operator gates: deploy the three migrations and matching web API, supply and verify real production public configuration/signing/push credentials, make a signed EAS build, complete the TestFlight device and accessibility passes, capture real screenshots, verify privacy and age-rating answers in App Store Connect, add private review credentials/contact details, and submit the processed build. Do not mark those checkboxes complete from source verification alone.
