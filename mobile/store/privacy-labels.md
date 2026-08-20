# App Privacy Worksheet

Complete these answers in App Store Connect only after comparing them with the production build and every enabled third-party SDK. Apple requires the declaration to include both Flipd’s practices and integrated partners’ practices.

## Required URLs

- Privacy Policy: https://www.flipdcampus.com/privacy
- Optional Privacy Choices URL: use the public support or dedicated deletion/help URL only if it directly explains privacy choices and account deletion.

## Data collected

| Apple data type | Flipd use | Linked to identity | Tracking |
|---|---|---:|---:|
| Email Address | USC verification, OTP sign-in, account and notification email | Yes | No |
| Name | Public marketplace profile and requests | Yes | No |
| User ID | Authentication, ownership, safety, and messaging | Yes | No |
| Photos or Videos | Avatars, listing photos, message attachments | Yes | No |
| Other User Content | Listings, bios, requests, messages, reviews, reports | Yes | No |
| Precise Location | Optional listing pickup pin selected by the user | Yes | No |
| Coarse Location | Review whether map/place SDK or platform derives it in production | Owner must verify | No |
| Product Interaction | Searches, saves, requests, notification state, listing activity | Yes | No |
| Device ID / Push Token | Push delivery to the signed-in device | Yes | No |
| Crash Data | Declare only if the production build enables a crash/diagnostic provider | Owner must verify | No |
| Performance Data | Declare only if hosting/native SDKs collect it from the submitted build | Owner must verify | No |

## Purposes to select

- App Functionality: all identity, profile, listing, message, attachment, push, report, and location data required to provide the product.
- Developer Communications: email and push notifications about sign-in, requests, approvals, messages, reminders, and expiry.
- Analytics: select only for search/product interaction data actually used to understand or improve usage.
- Fraud Prevention, Security, and Compliance: account identity, reports, blocks, retained anonymized safety records, and transaction history.
- Personalization: do not select unless the submitted build uses collected data to personalize recommendations beyond explicit filters/saves.
- Third-Party Advertising / Developer Advertising: No.

## Tracking determination

Current source contains no advertising SDK or cross-company tracking use. Answer **No, data is not used for tracking** unless the production build or a newly enabled partner changes that conclusion.

## Retention and deletion check

- In-app deletion is at Profile → Delete account.
- Personal profile/contact data, public listings, owned media, notification tokens, and authentication access are removed.
- Transaction, message, and moderation records may remain only in anonymized form for safety, disputes, fraud prevention, or legal obligations.
- Confirm the production database migrations and deletion endpoint are deployed before publishing these answers.

## Owner verification

- [ ] Compare this worksheet with the exact EAS production dependency list.
- [ ] Confirm Supabase, Expo push, hosting, maps/places, email, and any diagnostics providers.
- [ ] Confirm whether precise location is transmitted only after a user selects a listing location.
- [ ] Publish the final answers in App Store Connect.

