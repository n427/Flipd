# Mobile App Store Readiness — Design

**Date:** 2026-08-20  
**Scope:** Flipd Expo mobile app only, plus the smallest shared server/database changes required by mobile release compliance.

## Goal

Remove the code-level blockers identified in the mobile release audit and leave a reproducible operator checklist for the Apple-account and device work that cannot be completed from source alone.

## Release boundary

This pass implements:

- In-app account deletion with an explicit destructive confirmation.
- Server-side deletion/anonymization that prevents future sign-in and removes personal data.
- A branded native launch screen.
- Explicit iOS camera and photo-library permission descriptions.
- A contextual notification explainer before the native permission dialog.
- Mobile Community Guidelines and conversation reporting.
- Versioned Terms and Privacy acceptance during onboarding.
- Targeted accessibility improvements for primary release flows.
- App Store metadata and reviewer-note templates.

This pass does not claim to complete distribution signing, App Store Connect configuration, TestFlight device testing, authenticated screenshot capture, privacy-label submission, age-rating submission, or final review submission. Those require the project owner's Apple account, production credentials, or a physical/TestFlight build.

## Account deletion

### User experience

Profile exposes **Delete account** as a destructive action. The user sees a plain-language explanation of what is deleted and what may be retained in anonymized form, then must enter an explicit confirmation phrase before submission. The UI prevents duplicate submissions and reports retryable failures without signing the user out prematurely.

### Server contract

The mobile client calls an authenticated server endpoint or Supabase Edge Function; it never receives a service-role key. The server verifies the bearer session, runs cleanup with elevated privileges, deletes owned storage objects and push tokens, removes or anonymizes personal/contact/profile fields, removes active listings and other public user content, and finally deletes the authentication identity so the session cannot be reused.

Messages, moderation reports, and transaction/safety records may be retained only in anonymized form where required for fraud prevention, dispute handling, or legal obligations. Retained rows must no longer expose the deleted user's name, email, phone, social handles, avatar, device token, or other direct identifier to ordinary users.

The operation is idempotent: retrying after partial completion is safe. The server records only operational status and non-sensitive failure diagnostics.

## Launch assets and permissions

The existing Flipd mark is rendered into a launch asset with safe padding and configured through `expo-splash-screen` on a white background. The configuration supports the current light appearance without introducing an unrelated dark visual treatment.

`app.json` declares clear iOS usage text for camera and photo-library access. The final generated archive must still be inspected before submission because native generation is the authoritative source.

## Notifications

Push permission is not requested immediately after session restoration. The app first shows a lightweight in-product explanation at a relevant point after onboarding. Choosing **Enable notifications** opens the native prompt; choosing **Not now** dismisses the explainer without repeatedly nagging during the same app lifecycle. Existing push registration and deep-link behavior remain unchanged after authorization.

## Safety and legal acceptance

Community Guidelines are available from Profile and cover prohibited goods/services, harassment, scams, unsafe food, housing fraud, academic misconduct, reporting, blocking, and enforcement.

Message threads expose a report action that creates a moderation report containing the thread identifier and reporting user. Report copy must not promise live monitoring or guaranteed response times.

Onboarding requires affirmative acceptance of the current Terms and Privacy versions. Acceptance stores the user ID, document versions, and server timestamp. Existing users are prompted only when no acceptance exists for the current versions. Acceptance is not inferred from merely opening a document.

## Accessibility

The release pass covers the sign-in/onboarding flow, tab navigation, feed/listing actions, messaging composer, reporting, legal screens, notification explainer, and account deletion. Interactive controls receive meaningful labels/roles, icon-only controls receive names, destructive and disabled states are announced, touch targets remain usable, and layouts avoid fixed-height assumptions that break larger text. A physical-device VoiceOver and Dynamic Type pass remains an operator gate.

## App Store package

Source-controlled templates define the proposed name/subtitle, description, keywords, category, support/privacy URLs, review notes, review-account instructions, screenshot captions, privacy-label worksheet, age-rating worksheet, and export-compliance checklist. They contain explicit placeholders for values that only the owner can supply; no credentials are committed.

Screenshots are not fabricated from unauthenticated or mock screens. Final compositions use real TestFlight UI and the current 6.9-inch portrait requirements, with iPad assets only if iPad support remains enabled.

## Testing and verification

Behavioral changes follow red-green TDD using pure helpers or existing test seams where React Native rendering is impractical. Required automated gates are:

- Focused tests for deletion request state, acceptance versions, notification prompt policy, and reporting payloads.
- Full repository test suite.
- Mobile TypeScript check.
- Mobile lint.
- Expo Doctor.
- Production iOS export with production-shaped public environment variables.
- Static inspection of generated Expo configuration and bundle contents.

Manual operator gates are documented separately: real account deletion in staging, camera/photo access, push delivery and deep links, SecureStore session behavior, keyboard/layout checks, VoiceOver, Dynamic Type, production EAS build, TestFlight install, screenshots, and App Store Connect submission.

## Failure handling

- Destructive operations remain retryable and never report success until the server confirms completion.
- Permission denial keeps the affected feature usable through a clear fallback or Settings guidance.
- Failed moderation reports remain on screen with retry messaging.
- Legal acceptance writes are server-timestamped and block onboarding completion until confirmed.
- Missing production/operator credentials are reported as release gates, not silently substituted with test values.

## Non-goals

- Reworking unrelated web UI.
- Redesigning the marketplace or navigation.
- Inventing a full moderation operations team or SLA in code.
- Publishing to Apple without explicit owner access and final approval.

