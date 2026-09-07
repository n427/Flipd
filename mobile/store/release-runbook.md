# Flipd App Store Checklist

Use this checklist for Flipd `1.0.0 (10)`.

## Already done

- [x] Production website and API are deployed.
- [x] Required database features are live.
- [x] Automated web and mobile tests pass.
- [x] App Store text and configuration pass validation.
- [x] Production iOS build 10 was signed and built.
- [x] Apple processed build 10 successfully.
- [x] Build 10 is available in TestFlight.

## 1. Test build 10 on your iPhone

- [ ] Install Flipd `1.0.0 (10)` from TestFlight.
- [ ] Confirm the Flipd splash screen appears.
- [ ] Sign in with a USC email and confirm you stay signed in after reopening the app.
- [ ] Test Feed, Search, Listings, Wanted, Requests, Saved, and Profile.
- [ ] Create, edit, and delete a listing and a Wanted request.
- [ ] Send a request, approve it, and exchange messages and attachments.
- [ ] Test camera and photo-library access, including tapping “Don’t Allow.”
- [ ] Enable notifications and confirm tapping one opens the correct screen.
- [ ] Report a listing, profile, Wanted request, and conversation.
- [ ] Block a user and confirm their content and contact options disappear.
- [ ] Delete a test account and confirm it can no longer sign in.
- [ ] Check that the keyboard does not cover buttons or fields.

## 2. Check accessibility

- [ ] Turn on VoiceOver and test sign-in, posting, messaging, reporting, and account deletion.
- [ ] Set Text Size to the largest setting and check for clipped or hidden content.
- [ ] Confirm buttons have clear names when using Voice Control.
- [ ] Confirm important information does not rely on color alone.

Only claim accessibility features in App Store Connect if they pass these checks.

## 3. Take App Store screenshots

- [ ] Use build 10 and a dedicated screenshot account with safe sample content.
- [ ] Capture the five screens listed in `screenshots.md`.
- [ ] Use one accepted 6.9-inch portrait size: 1260×2736, 1290×2796, or 1320×2868.
- [ ] Remove private messages, email addresses, phone numbers, codes, and real personal data.
- [ ] Confirm Flipd is iPhone-only. If iPad support is enabled, test iPad and add its screenshots.

## 4. Finish App Store Connect

- [ ] Add the name, subtitle, description, keywords, category, and public URLs from `metadata.md`.
- [ ] Upload the screenshots.
- [ ] Complete the privacy questions using `privacy-labels.md`.
- [ ] Complete the age-rating questions using `age-rating.md` and apply the planned 18+ override.
- [ ] Confirm Flipd has permission to show every image included in the screenshots.
- [ ] Confirm the encryption answer is correct.
- [ ] Set the app’s price, tax category, and countries or regions.
- [ ] Add a review contact and a dedicated reviewer account privately in App Store Connect.
- [ ] Paste the instructions from `review-notes.md` and verify every path against build 10.
- [ ] Choose manual release for the first launch.

## 5. Submit and release

- [ ] Select build `1.0.0 (10)` for the App Store version.
- [ ] Click **Add for Review**, then **Submit for Review**.
- [ ] Answer any questions from Apple.
- [ ] After approval, run one last test on the production app.
- [ ] Release the app manually.
- [ ] Watch sign-in, crashes, notifications, reports, and account-deletion failures after launch.

## Known follow-ups

- Google Places autocomplete is disabled because `EXPO_PUBLIC_GOOGLE_PLACES_KEY` is not configured. Campus location buttons and the map still work.
- Supabase migration history does not correctly record local migrations 036–038, although their production database objects are live. Repair the history separately; do not reapply those migrations.
- The mobile dependency audit reports transitive issues that require a tested Expo upgrade. Do not run `npm audit fix --force` immediately before release.

## Release record

- Release code commit: `c470cc7`
- Checklist commit before this rewrite: `9fb056d`
- EAS build: `1.0.0 (10)`
- EAS build ID: `35a92824-e504-4514-9da2-4834e9d38c8d`
- EAS submission ID: `8d28a332-e05d-48ab-8de3-631552d004ef`
- Apple processing state: `VALID`
- TestFlight state: internal testing
- Last verified: 2026-09-06
