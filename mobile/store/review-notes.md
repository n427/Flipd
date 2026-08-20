# App Review Notes

## Private App Store Connect fields

ADD REVIEW CREDENTIALS PRIVATELY IN APP STORE CONNECT — DO NOT COMMIT THEM.

Provide a dedicated, non-expiring App Review account or documented review authentication path. The production app normally signs in through a one-time code sent to an @usc.edu email; App Review must not depend on an inaccessible personal inbox or a code that expires before testing.

Required private fields:

- Review contact name
- Review contact email
- Review contact phone in international format
- Review username/email
- Review password or reliable OTP access instructions

## Suggested review notes

Flipd is a marketplace limited to verified USC email accounts. A reviewer can use the private review credentials supplied in App Store Connect.

Primary flows:

1. Sign in and complete any Terms/Privacy acceptance prompt.
2. Feed shows current student listings and search/filter controls.
3. Open a listing to save it, view the seller, report it, or send a request.
4. Approved requests appear under Requests and open a private conversation.
5. Create a listing from the center Post tab. Camera/photo permission is requested only when the reviewer chooses to add media.
6. Notification permission is preceded by a Flipd explainer and remains optional.
7. Report controls are available on listings, profiles, and conversations. Blocking is available from a profile.
8. Community Guidelines, Terms, Privacy, and Support are under Profile.
9. Account deletion is under Profile → Delete account. Type DELETE to confirm. This removes authentication access, personal/contact data, public listings, owned media, and push tokens; anonymized safety records may be retained as described on screen and in the Privacy Policy.

Flipd has no purchases, subscriptions, advertising, or general-purpose web browsing. Flipd is independent and is not affiliated with or endorsed by USC.

## Pre-submission reviewer check

- [ ] Review account works in the exact TestFlight build without staff intervention.
- [ ] Account has enough seeded data to inspect Feed, Requests, and Messages.
- [ ] Any review bypass is production-safe, narrowly scoped, and documented privately.
- [ ] Support and privacy URLs load publicly.

