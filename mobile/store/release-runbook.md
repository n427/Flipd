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

Not recorded yet. The final release-gate task must add the date, commit SHA, exact commands, exit status, test counts, audit result, export path, and remaining operator gates without marking device or Apple-account work complete.

