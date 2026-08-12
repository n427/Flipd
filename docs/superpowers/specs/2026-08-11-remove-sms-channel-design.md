# Remove the SMS Channel and Phone Contact — Design

**Goal:** Delete every text-message feature from Flipd. Flipd stops being able to text users, and users stop being able to store a phone number at all. Notification channels reduce to two: in-app push and email.

**Status:** Approved 2026-08-11. Supersedes Subsystem 3 of
[2026-08-06-notification-system-design.md](2026-08-06-notification-system-design.md).

---

## Why this is a clean removal

The SMS channel was built in full (phase 3, merged as `93e2ab6`) and never switched
on. Two facts establish that:

- `sendSms()` has exactly one caller — the phone-verification start route. No
  notification producer anywhere calls `canSms()`.
- The "Text" channel is rendered `disabled` with a "Coming soon" hint in both
  onboarding flows, so no user ever opted in.

No production behaviour changes for any user. Nothing is being turned off,
because nothing was ever turned on.

## The naming trap

Two unrelated features both say "phone". Getting this distinction wrong in either
direction breaks the app:

| Symbol | Feature | Fate |
|---|---|---|
| `phone_verified_at`, `sms_consent_at`, `phone_verifications` | SMS channel — Flipd texting the user | Deleted |
| `contact_phone`, `contact_method: 'phone'` | Contact detail shared with other users | Deleted (see below) |
| `contact_email`, `contact_instagram`, `contact_method` machinery | Contact exchange | **Kept** |

`contact_phone` is deleted not because it is part of the SMS channel, but because
the code's own comments state its only remaining purpose was Flipd reaching the
user: *"conversations happen in the app, so a phone number is only ever a way for
us to reach you."* Once Flipd cannot text, the field has no consumer.

## Scope

**Removed**

- Phone verification (start + confirm), SMS consent route, STOP webhook
- `sendSms`, `canSms`, `wantsSms`, `SmsProfile`, and the `sms` key on `NotifyPrefs`
- The `sms` delivery channel in both onboarding flows
- `contact_phone` end to end: column, types, forms, API allowlists, mobile selects
- `SMS_API_KEY`, `SMS_API_URL`, `SMS_FROM` from `.env.local.example`

**Kept**

- Push (the `app` channel) and email — the two surviving notification options
- `contact_method`, `contact_instagram`, `primaryMethod`, `resolveSharedContact`,
  and the per-listing contact chips, now with email as their only live member

**Explicitly not in scope**

Collapsing the contact machinery to email-only. Instagram was already stubbed out
of the UI while its machinery survived, which establishes the existing preference
for keeping the seam. That collapse is a separate design if it is ever wanted.

## Decisions and rationale

**Approach: surgical, not a full collapse.** Smallest blast radius. The
listing-post and reveal/exchange paths are load-bearing and well tested; a
contact-machinery rewrite does not belong inside an SMS removal.

**`contact_phone` is dropped, not retained.** Retaining phone numbers with no
remaining purpose is a data-minimisation problem. This is irreversible: those
numbers are gone from production once `035` is applied.

**No user is stranded.** `contact_email` is locked to the verified USC account —
`readOnly`, *"Tied to your verified account, so it cannot be changed here."* Every
user therefore always has exactly one reachable contact after this change.

**Migration 033 is not reverted.** It did two separable things: SMS-specific
schema, and a general security fix that revoked blanket `update on profiles` from
`authenticated` in favour of an explicit column allowlist. That hardening protects
every column and must survive. Dropping a column takes its grant with it
automatically; the removal migration re-issues the `grant update (...)` anyway so
the final allowlist is readable in one place instead of inferred across two files.

## Components

### Deleted files

```
src/app/api/me/phone/start/route.ts
src/app/api/me/phone/confirm/route.ts
src/app/api/me/sms-consent/route.ts
src/app/api/sms/webhook/route.ts
src/lib/sms/verification.ts
src/lib/sms/verification.test.ts
```

The directories `src/lib/sms/`, `src/app/api/sms/` and `src/app/api/me/phone/`
go empty and are removed with them.

### Edited files

| File | Change |
|---|---|
| `src/lib/notify.ts` | Drop `wantsSms`, `canSms`, `SmsProfile`, `sendSms`; drop `sms` from `NotifyPrefs` |
| `src/lib/notify.test.ts` | Drop the `wantsSms`, `sendSms`, `canSms` describe blocks |
| `src/lib/types.ts` | `ContactMethod` drops `'phone'`; `Profile` drops `contact_phone`; prefs drop `sms` |
| `src/lib/validation.ts` | `ContactValues` drops `phone`; `METHOD_ORDER` → `['instagram', 'email']` |
| `src/lib/validation.test.ts` | Update `primaryMethod` and `resolveSharedContact` cases |
| `src/app/api/me/route.ts` | Drop `contact_phone` from writable columns, `'phone'` from `CONTACT_METHODS`, the `sms` prefs branch |
| `src/app/api/listings/route.ts` | Drop `phone` from the filled-methods intersection and column map |
| `src/app/onboarding/page.tsx` | `METHODS` drops phone; `CHANNEL_OPTIONS` drops sms; prefs write drops sms; contact copy |
| `src/app/(app)/profile/edit/page.tsx` | Same, plus the now-dead `required` branch keyed on `m.id === 'phone'` |
| `mobile/src/app/(onboarding)/setup.tsx` | `METHODS` drops phone; `CHANNEL_OPTIONS` drops sms; contact copy |
| `mobile/src/app/(tabs)/edit-profile.tsx` | Drop phone state, write and field |
| `mobile/src/lib/listings.ts` | Drop `contact_phone` from select and types; `METHOD_ORDER` → `['email']` |
| `mobile/src/lib/session.tsx` | Drop `contact_phone` from select and the `hasContact` check |
| `.env.local.example` | Drop the three SMS vars |

### Database: `supabase/migrations/035_remove_sms.sql`

Numbered **035**, not 034 — the unmerged `listing-match-digest` branch already
owns `034_listing_digest.sql`.

Order matters: the trigger references a column being dropped, and rows pointing
at `'phone'` must be re-pointed before the column disappears under them.

1. `drop trigger profiles_clear_phone_verification on public.profiles`
2. `drop function public.clear_phone_verification()`
3. `drop table public.phone_verifications`
4. **Re-point orphaned rows**, then tighten the constraint:

```sql
update public.profiles set contact_method = 'email' where contact_method = 'phone';

alter table public.profiles drop constraint if exists profiles_contact_method_check;
alter table public.profiles add constraint profiles_contact_method_check
  check (contact_method in ('instagram', 'email'));
```

`contact_method = 'phone'` is legal today under the check constraint in
`007_identity_contact.sql`. Left alone, those rows would name a column that no
longer exists. `'email'` is always a safe target because `contact_email` is locked
to the verified account and therefore always populated. The constraint is then
narrowed so the database agrees with the narrowed `ContactMethod` union rather
than silently permitting a value the app can no longer produce.

5. Drop the columns — each needs its own `drop column` clause:

```sql
alter table public.profiles
  drop column phone_verified_at,
  drop column sms_consent_at,
  drop column contact_phone;
```

6. Re-issue `grant update (...) on public.profiles to authenticated` minus `contact_phone`
7. Strip the dead `sms` key from every event in `notify_prefs`:

```sql
update public.profiles
set notify_prefs = coalesce(
  (select jsonb_object_agg(key, value - 'sms') from jsonb_each(notify_prefs)),
  '{}'::jsonb
)
where notify_prefs is not null;
```

The `coalesce` is load-bearing: `jsonb_each` over an empty `{}` yields zero rows,
and `jsonb_object_agg` over zero rows returns `NULL` — without it, every user
holding an empty prefs object would have `notify_prefs` nulled out.

## Sequencing risks

**The working tree is dirty on the target files.** `src/app/(app)/profile/edit/page.tsx`
and `mobile/src/app/(tabs)/edit-profile.tsx` carry uncommitted changes on the phone
lines themselves — the `required` marker and `inputMode='tel'`. Implementation edits
land on top of unreviewed work. Committing or stashing that work first is cleanest;
if it is left in place, the removal commits will necessarily carry it along.

**`src/lib/notify.ts` is also modified by `listing-match-digest`.** That branch
appends `digestEmail` while this change deletes the SMS functions from mid-file.
Different regions, so it should auto-merge, but it is a conflict candidate.
Merging the digest branch first avoids it.

## Testing

- `npx vitest run` — full suite green, with the SMS describe blocks gone and the
  validation cases updated
- `npx tsc --noEmit` — clean; this is the real check, since dropping a field from
  `Profile` and a member from `ContactMethod` surfaces every stale reference
- Repo-wide grep for `sms|phone_verif|contact_phone` returns only historical plan
  documents
- After applying `035`, `select count(*) from public.profiles where contact_method
  = 'phone';` returns 0, and `select contact_phone from public.profiles limit 1;`
  errors with "column does not exist"

## Operator steps (human only — not agent work)

1. Apply `035_remove_sms.sql` in the Supabase SQL editor. **This permanently
   deletes every stored phone number.** Take a backup first if there is any doubt.
   The check constraint is unnamed in `007_identity_contact.sql`, so it should have
   been auto-named `profiles_contact_method_check`; if the `drop constraint if
   exists` is a silent no-op, confirm the real name with `\d public.profiles` and
   correct the migration before the `add constraint` line fails on a duplicate.
2. Remove `SMS_API_KEY`, `SMS_API_URL`, `SMS_FROM`, `SMS_WEBHOOK_SECRET` from
   Vercel (Production and Preview) if they were ever set.
3. If an SMS provider account or number was provisioned, decommission it.
