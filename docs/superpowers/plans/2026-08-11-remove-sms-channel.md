# Remove the SMS Channel and Phone Contact — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete every text-message feature from Flipd — Flipd can no longer text
users, and users can no longer store a phone number. Notification channels reduce
to in-app push and email.

**Architecture:** Consumer-first removal. UI stops using phone, then the API layer,
then the shared types narrow, then the database drops the columns. This ordering
keeps `tsc --noEmit` green at every commit; narrowing the types first would leave
the tree red across several tasks.

**Tech Stack:** Next.js 14 App Router, React 18, Expo (mobile), Supabase (Postgres
+ RLS), Vitest 4, TypeScript 5.5.

Spec: [2026-08-11-remove-sms-channel-design.md](../specs/2026-08-11-remove-sms-channel-design.md)

## Global Constraints

- **Approach is surgical, not a full collapse.** `contact_method`,
  `contact_instagram`, `primaryMethod`, `resolveSharedContact` and the per-listing
  contact chips all STAY, with email as their only live member. Do not delete them.
- **Instagram stays** everywhere it currently appears. Only `phone` is removed.
- **Push is unaffected.** `wantsPush`, `sendPush` and the `app`/`push` pref keys are
  untouched. The two surviving channels are `app` and `email`.
- **Migration is numbered 035.** `034_listing_digest.sql` is already taken by the
  unmerged `listing-match-digest` branch.
- **Never revert `033_sms_consent.sql`.** Its column-grant hardening protects every
  profile column, not just the SMS ones.
- Vitest's include glob is `src/**/*.test.ts` — `.tsx` files have no tests, so UI
  tasks are verified by `tsc` and grep, not by unit tests. Do not invent component
  tests for this repo.
- Verification commands: `npm test` (web unit tests), `npx tsc --noEmit` (web types),
  `npx tsc --noEmit -p mobile/tsconfig.json` (mobile types).

## Pre-flight

The working tree carries ~59 uncommitted/untracked files, including changes on the
very phone lines this plan edits (`src/app/(app)/profile/edit/page.tsx`,
`mobile/src/app/(tabs)/edit-profile.tsx`). Line numbers below were read from the
**working-tree** state, not from HEAD. Re-read each region before editing; if it
does not match, trust the file.

Note also that `src/app/onboarding/page.tsx` calls its contact array
`CONTACT_FIELDS` while `src/app/(app)/profile/edit/page.tsx` calls the equivalent
array `METHODS`. They are not the same name. Do not assume.

## File Structure

| File | Change |
|---|---|
| `src/app/api/me/phone/start/route.ts` | Delete |
| `src/app/api/me/phone/confirm/route.ts` | Delete |
| `src/app/api/me/sms-consent/route.ts` | Delete |
| `src/app/api/sms/webhook/route.ts` | Delete |
| `src/lib/sms/verification.ts` | Delete |
| `src/lib/sms/verification.test.ts` | Delete |
| `src/lib/notify.ts` | Drop `wantsSms`, `canSms`, `SmsProfile`, `sendSms`, the `sms` pref key |
| `src/lib/notify.test.ts` | Drop three describe blocks + import |
| `.env.local.example` | Drop three SMS vars |
| `src/app/onboarding/page.tsx` | Drop phone field, sms channel, sms pref write |
| `src/app/(app)/profile/edit/page.tsx` | Drop phone field, the "Text" pref column |
| `mobile/src/app/(onboarding)/setup.tsx` | Drop phone field, sms channel, sms pref write |
| `mobile/src/app/(tabs)/edit-profile.tsx` | Drop phone state, field, write |
| `mobile/src/lib/listings.ts` | Drop `contact_phone` from type/select, narrow `METHOD_ORDER` |
| `mobile/src/lib/session.tsx` | Drop `contact_phone` from select + `hasContact` |
| `src/app/api/me/route.ts` | Drop from `EDITABLE`, `CONTACT_METHODS`, sms pref branch |
| `src/app/api/listings/route.ts` | Drop phone from the filled-methods intersection |
| `src/lib/types.ts` | Narrow `ContactMethod`, drop `contact_phone`, drop `sms` |
| `src/lib/validation.ts` | Narrow `ContactValues` and `METHOD_ORDER` |
| `src/lib/validation.test.ts` | Update contact fixtures and expectations |
| `supabase/migrations/035_remove_sms.sql` | Create |
| `docs/superpowers/specs/2026-08-06-notification-system-design.md` | Mark Subsystem 3 removed |

---

### Task 1: Delete the SMS delivery layer

Self-contained: `src/lib/sms/` is imported only by the routes deleted here, and
`sendSms` has exactly one caller (the verification start route, also deleted).

**Files:**
- Delete: `src/app/api/me/phone/start/route.ts`, `src/app/api/me/phone/confirm/route.ts`, `src/app/api/me/sms-consent/route.ts`, `src/app/api/sms/webhook/route.ts`, `src/lib/sms/verification.ts`, `src/lib/sms/verification.test.ts`
- Modify: `src/lib/notify.ts`, `src/lib/notify.test.ts`, `.env.local.example`

**Interfaces:**
- Consumes: nothing.
- Produces: `src/lib/notify.ts` exports shrink to `wantsEmail`, `wantsPush`,
  `verifiedEmailFor`, `sendEmail`, `sendPush`, and the `*Email()` template helpers.
  `NotifyPrefs` becomes `Partial<Record<NotifyEvent, { app?: boolean; email?: boolean; push?: boolean }>>`.

- [ ] **Step 1: Delete the six files and their now-empty directories**

```bash
git rm src/app/api/me/phone/start/route.ts \
       src/app/api/me/phone/confirm/route.ts \
       src/app/api/me/sms-consent/route.ts \
       src/app/api/sms/webhook/route.ts \
       src/lib/sms/verification.ts \
       src/lib/sms/verification.test.ts
rmdir src/app/api/me/phone/start src/app/api/me/phone/confirm src/app/api/me/phone \
      src/app/api/sms/webhook src/app/api/sms src/lib/sms 2>/dev/null || true
```

- [ ] **Step 2: Strip SMS from `src/lib/notify.ts`**

Replace the file's opening comment (lines 1-4) — it currently advertises SMS:

```ts
// Outbound notification layer (server only). Email via Resend's REST API —
// key comes from RESEND_API_KEY in the environment; with no key set, sends
// are logged instead so development works without a provider. SMS is a
// deferred opt-in: prefs carry the shape, nothing sends yet.
```

with:

```ts
// Outbound notification layer (server only). Email via Resend's REST API —
// key comes from RESEND_API_KEY in the environment; with no key set, sends
// are logged instead so development works without a provider. Push goes out
// through Expo. Those two are the whole channel list.
```

Drop `sms` from the prefs shape on line 12:

```ts
type NotifyPrefs = Partial<Record<NotifyEvent, { app?: boolean; email?: boolean; push?: boolean }>>;
```

Delete lines 27-52 entirely — the `wantsSms` comment and function, the
`SmsProfile` type, and the `canSms` comment and function. Delete the `sendSms`
function and its preceding comment block (the comment starting "// configured the
send is logged instead…" through the closing brace of `sendSms`). Leave
`verifiedEmailFor`, `sendEmail`, `sendPush` and every `*Email()` helper untouched.

- [ ] **Step 3: Strip SMS from `src/lib/notify.test.ts`**

Change the import on line 2:

```ts
import { wantsEmail, wantsPush, popupReminderEmail } from './notify';
```

`afterEach`, `beforeEach` and `vi` are used only by the `sendSms` block being
deleted, so narrow line 1 too:

```ts
import { describe, expect, it } from 'vitest';
```

Delete three whole describe blocks: `wantsSms` (lines 4-25), `sendSms`
(lines 34-92), and `canSms` (lines 117-148). Keep `email and push keep defaulting
ON for the new event` and `popupReminderEmail`.

- [ ] **Step 4: Remove the SMS vars from `.env.local.example`**

Delete these three lines (they sit around lines 26-28):

```
SMS_API_KEY=
SMS_API_URL=
SMS_FROM=
```

- [ ] **Step 5: Verify**

Run: `npm test`
Expected: PASS. `notify.test.ts` now reports 5 tests (2 in the email/push block,
3 in `popupReminderEmail`), and `src/lib/sms/verification.test.ts` no longer
appears in the run.

Run: `npx tsc --noEmit`
Expected: clean, no output.

- [ ] **Step 6: Commit**

```bash
git add -A src/lib/notify.ts src/lib/notify.test.ts .env.local.example
git commit -m "refactor(notify): delete the SMS delivery layer

sendSms had one caller (phone verification) and no producer ever called
canSms, so nothing observable changes. Removes the verification routes,
the consent route, the STOP webhook and src/lib/sms entirely."
```

---

### Task 2: Remove phone from the web UI

**Files:**
- Modify: `src/app/onboarding/page.tsx`, `src/app/(app)/profile/edit/page.tsx`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: neither page sends `contact_phone` or an `sms` pref key to `/api/me`.
  Both still send `contact_method` via `primaryMethod({ instagram: null, email })`.

- [ ] **Step 1: `src/app/onboarding/page.tsx` — constants**

Replace `CONTACT_FIELDS` (lines 13-16) and its comment:

```tsx
// Where Flipd sends notifications. These are NOT shared with other users —
// conversations happen in the app.
const CONTACT_FIELDS = [
  { id: 'email', valueLabel: 'Email', placeholder: 'you@usc.edu' },
] as const;
```

Replace `CHANNEL_OPTIONS` (lines 20-24), dropping the sms entry:

```tsx
// Delivery channels the user can opt into, per the notify_prefs jsonb shape.
const CHANNEL_OPTIONS = [
  { id: 'app', label: 'In the app', hint: 'Push notifications' },
  { id: 'email', label: 'Email', hint: '' },
] as const;
```

- [ ] **Step 2: `src/app/onboarding/page.tsx` — state and effect**

Line 55 — drop phone from the contacts state:

```tsx
  const [contacts, setContacts] = React.useState<{ email: string }>({ email: '' });
```

Lines 68-69 — the `hasContact` check:

```tsx
        // Instagram no longer counts: it can't receive a notification.
        const hasContact = Boolean(profile?.contact_email);
```

- [ ] **Step 3: `src/app/onboarding/page.tsx` — submit**

Lines 91-92 become an email-only guard:

```tsx
    if (!contacts.email.trim()) { setError('Add an email so we can reach you.'); return; }
```

Lines 112-120 — drop `contact_phone` and the `sms` pref key:

```tsx
          contact_method: primaryMethod({ instagram: null, email: contacts.email.trim() || null }),
          contact_email: contacts.email.trim() || null,
          notify_prefs: Object.fromEntries(
            ALL_EVENTS.map((ev) => [ev, {
              app: channels.includes('app'),
              email: channels.includes('email'),
            }]),
          ),
```

- [ ] **Step 4: `src/app/onboarding/page.tsx` — render**

Line 209 — remove the phone-only `inputMode`:

```tsx
                  placeholder={m.placeholder}
                />
```

Lines 216-241 — every channel is now real, so the `disabled` machinery goes.
Replace the `CHANNEL_OPTIONS.map` callback body so it reads:

```tsx
                {CHANNEL_OPTIONS.map((c) => {
                  const on = channels.includes(c.id);
                  return (
                    <label
                      key={c.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        border: '1.5px solid ' + (on ? 'var(--ink)' : 'var(--rule)'),
                        borderRadius: 12, padding: '11px 14px',
                        cursor: 'pointer', fontSize: 14.5,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) => setChannels((prev) =>
                          e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id))}
                        style={{ width: 16, height: 16 }}
                      />
                      <span style={{ fontWeight: 600 }}>{c.label}</span>
                      {c.hint && <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>{c.hint}</span>}
                    </label>
                  );
                })}
```

- [ ] **Step 5: `src/app/(app)/profile/edit/page.tsx` — constants and state**

Replace `METHODS` (lines 13-16) and its comment:

```tsx
// Notification destinations, not things other users see. Conversations happen
// in the app.
const METHODS = [
  { id: 'email', valueLabel: 'Email', placeholder: 'you@usc.edu' },
] as const;
```

Line 37 — contacts state:

```tsx
  const [contacts, setContacts] = React.useState<{ email: string }>({ email: '' });
```

Line 39 — drop `sms` from the prefs state type:

```tsx
  const [prefs, setPrefs] = React.useState<Record<string, { app?: boolean; email?: boolean }>>({});
```

Lines 51-54 — prefill:

```tsx
    setContacts({ email: me.contact_email ?? '' });
```

- [ ] **Step 6: `src/app/(app)/profile/edit/page.tsx` — submit**

Lines 62-63:

```tsx
    if (!contacts.email.trim()) { setError('Add an email so we can reach you.'); return; }
```

Lines 81-82 — drop `contact_phone`:

```tsx
          contact_method: primaryMethod({ instagram: null, email: contacts.email.trim() || null }),
          contact_email: contacts.email.trim() || null,
```

- [ ] **Step 7: `src/app/(app)/profile/edit/page.tsx` — render**

Replace the whole `METHODS.map` block (lines 157-186). `locked` stays — it is now
always true, which is correct: email is the only method and it is tied to the
verified account.

```tsx
          {METHODS.map((m) => {
            // Email is fixed to the verified account and is the only contact
            // method, so this field is always read-only.
            const locked = m.id === 'email';
            return (
              <div key={m.id}>
                <label className="field-label">{m.valueLabel}</label>
                <input
                  className="field"
                  value={contacts[m.id]}
                  onChange={locked ? undefined : (e) => setContacts((c) => ({ ...c, [m.id]: e.target.value }))}
                  placeholder={m.placeholder}
                  readOnly={locked}
                  aria-readonly={locked || undefined}
                  style={locked ? { background: 'var(--surface)', color: 'var(--muted)', cursor: 'not-allowed' } : undefined}
                />
                {locked && (
                  <p style={{ fontSize: 12, color: 'var(--muted)', margin: '6px 0 0', lineHeight: 1.5 }}>
                    Tied to your verified account, so it cannot be changed here.
                  </p>
                )}
              </div>
            );
          })}
```

In the notifications grid, delete the "Text" column. Change **both**
`gridTemplateColumns` values (lines 192 and 199) from `'1fr 64px 64px 64px'` to
`'1fr 64px 64px'`, delete the `<span style={{ textAlign: 'center' }}>Text</span>`
header, and delete the trailing `soon` cell (lines 217-219):

```tsx
                <span style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted-2)' }} title="Text notifications are coming soon">
                  soon
                </span>
```

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit`
Expected: clean. (`contact_phone` is still a legal field on `Profile` at this
point — Task 5 removes it — so this proves the pages compile without using it.)

Run: `grep -rn "phone" src/app/onboarding/page.tsx "src/app/(app)/profile/edit/page.tsx"`
Expected: no matches.

- [ ] **Step 9: Commit**

```bash
git add src/app/onboarding/page.tsx "src/app/(app)/profile/edit/page.tsx"
git commit -m "feat(web): drop phone contact and the Text channel from the UI

Email is locked to the verified account and always present, so it becomes
the only contact field. The Text channel and the 'soon' pref column go with
it — both promised a delivery that no longer exists."
```

---

### Task 3: Remove phone from mobile

**Files:**
- Modify: `mobile/src/app/(onboarding)/setup.tsx`, `mobile/src/app/(tabs)/edit-profile.tsx`, `mobile/src/lib/listings.ts`, `mobile/src/lib/session.tsx`

**Interfaces:**
- Consumes: nothing from Tasks 1-2.
- Produces: `OnboardingInput` in `mobile/src/lib/listings.ts` loses `contact_phone`;
  `MyProfile` loses `contact_phone`; `updateMyProfile`'s patch type loses
  `contact_phone`; `METHOD_ORDER` becomes `['email'] as const`.

- [ ] **Step 1: `mobile/src/lib/listings.ts` — types and select**

Delete `contact_phone: string | null;` from `MyProfile` (line 246). Update the
select on line 255:

```ts
    .select('id, display_name, school_unit, class_year, bio, avatar_url, contact_instagram, contact_email, notify_prefs, heard_from')
```

Replace `METHOD_ORDER` and its comment (lines 606-611):

```ts
// Contact channels, in the order that decides the primary one. Mirrors
// METHOD_ORDER in web src/lib/validation.ts — /api/me validates contact_method
// against the same list. Email is the only one left: Instagram was never a
// notification destination, and phone went with the SMS channel.
const METHOD_ORDER = ['email'] as const;
```

Delete `contact_phone: string | null;` from `OnboardingInput` (line 620) and drop
`sms` from its `notify_prefs` shape (line 622):

```ts
  notify_prefs?: Record<string, { app?: boolean; email?: boolean }>;
```

Delete `contact_phone?: string | null;` from the `updateMyProfile` patch type
(line 652).

- [ ] **Step 2: `mobile/src/lib/session.tsx` — onboarded check**

Line 49 select and line 58 `hasContact`:

```tsx
      .select('display_name, contact_instagram, contact_email')
```

```tsx
    const hasContact = Boolean(data?.contact_instagram || data?.contact_email);
```

- [ ] **Step 3: `mobile/src/app/(onboarding)/setup.tsx` — constants**

Replace `METHODS` (lines 28-33) and `CHANNEL_OPTIONS` (lines 36-40):

```tsx
// Where Flipd sends notifications. NOT shared with other users: conversations
// happen in the app.
const METHODS = [
  { id: 'email', label: 'Email', placeholder: 'you@usc.edu' },
] as const;
type MethodId = (typeof METHODS)[number]['id'];

const CHANNEL_OPTIONS = [
  { id: 'app', label: 'In the app', hint: 'Push notifications' },
  { id: 'email', label: 'Email', hint: '' },
] as const;
```

Line 59 — contacts state:

```tsx
  const [contacts, setContacts] = useState<Record<MethodId, string>>({ email: '' });
```

Line 75 — `hasContact`:

```tsx
        const hasContact = Boolean(p?.contact_email);
```

- [ ] **Step 4: `mobile/src/app/(onboarding)/setup.tsx` — submit**

Lines 145-148:

```tsx
    if (!contacts.email.trim()) {
      setError('Add an email so we can reach you.');
      return;
    }
```

Lines 162-169 — drop `contact_phone` and the `sms` key:

```tsx
        contact_email: contacts.email.trim() || null,
        notify_prefs: Object.fromEntries(
          ALL_EVENTS.map((ev) => [ev, {
            app: channels.includes('app'),
            email: channels.includes('email'),
          }]),
        ),
```

- [ ] **Step 5: `mobile/src/app/(onboarding)/setup.tsx` — render**

`METHODS` now holds only the locked email entry, so the editable `TextInput`
branch (lines 313-325, the one carrying `keyboardType="phone-pad"`) is
unreachable. Replace the whole `{METHODS.map((m) => { … })}` block (lines
299-328) with the locked display directly:

```tsx
            <Text style={label}>Email</Text>
            {/* The verified @usc.edu address they just signed in with. It is the
                identity this account is built on, so it is shown for
                confirmation but not editable here. */}
            <View style={[field, { justifyContent: 'center', backgroundColor: T.fieldbg }]}>
              <Text style={{ fontFamily: F.medium, fontSize: 15, color: T.muted }}>
                {contacts.email || user?.email}
              </Text>
            </View>
```

Every channel is now real, so the `disabled` machinery goes. Replace the whole
`CHANNEL_OPTIONS.map` block (lines 331-367) with:

```tsx
            {CHANNEL_OPTIONS.map((c) => {
              const on = channels.includes(c.id);
              return (
                <Pressable
                  key={c.id}
                  onPress={() =>
                    setChannels((prev) => (on ? prev.filter((x) => x !== c.id) : [...prev, c.id]))
                  }
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    borderWidth: 1.5,
                    borderColor: on ? T.ink : T.rule,
                    borderRadius: 12,
                    paddingVertical: 13,
                    paddingHorizontal: 14,
                  }}
                >
                  <Ionicons
                    name={on ? 'checkbox' : 'square-outline'}
                    size={19}
                    color={on ? T.cardinal : T.muted}
                  />
                  <Text style={{ flex: 1, fontFamily: F.semibold, fontSize: 15, color: T.ink }}>{c.label}</Text>
                  {c.hint ? (
                    <Text style={{ fontFamily: F.regular, fontSize: 12.5, color: T.muted }}>{c.hint}</Text>
                  ) : null}
                </Pressable>
              );
            })}
```

- [ ] **Step 6: `mobile/src/app/(tabs)/edit-profile.tsx`**

Delete the phone state (line 43) `const [phone, setPhone] = useState('');`, the
prefill (line 61) `setPhone(p.contact_phone ?? '');`, and the save field
(line 124) `contact_phone: phone.trim() || null,`.

Delete the phone field from the render — the `<Text style={label}>` block at
lines 255-257 and the `<TextInput>` at lines 258-265:

```tsx
        <Text style={label}>
          Phone{!email.trim() ? <Text style={{ color: T.cardinal }}> *</Text> : null}
        </Text>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="Phone number"
          placeholderTextColor={T.muted}
          keyboardType="phone-pad"
          style={field}
        />
```

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit -p mobile/tsconfig.json`
Expected: clean. If module resolution fails from the repo root, run `npx tsc
--noEmit` from inside `mobile/` instead.

Run: `grep -rn "contact_phone\|phone-pad\|setPhone" mobile/src/`
Expected: no matches.

- [ ] **Step 8: Commit**

```bash
git add mobile/src
git commit -m "feat(mobile): drop phone contact and the Text channel

Mirrors the web change. METHOD_ORDER collapses to ['email'], which makes the
editable contact branch in setup unreachable — replaced with the locked email
display it always resolved to."
```

---

### Task 4: Remove phone from the web API layer

**Files:**
- Modify: `src/app/api/me/route.ts:12-18,36-48`, `src/app/api/listings/route.ts:73-84`

**Interfaces:**
- Consumes: nothing from Tasks 1-3.
- Produces: `/api/me` PATCH rejects `contact_method: 'phone'` with
  `{ error: 'invalid contact method' }` (400) and silently ignores a
  `contact_phone` key. The per-listing contact intersection considers only
  `instagram` and `email`.

- [ ] **Step 1: `src/app/api/me/route.ts` — allowlists**

Lines 12-18:

```ts
const EDITABLE = [
  'display_name', 'handle', 'school_unit', 'class_year', 'bio', 'avatar_url',
  'contact_method', 'contact_instagram', 'contact_email',
  'heard_from', 'heard_from_detail',
] as const;

const CONTACT_METHODS = ['instagram', 'email'];
```

- [ ] **Step 2: `src/app/api/me/route.ts` — prefs**

Lines 36-48 — drop the `sms` branch and narrow the local type:

```ts
  if (body.notify_prefs && typeof body.notify_prefs === 'object') {
    const prefs: Record<string, { app?: boolean; email?: boolean }> = {};
    for (const ev of NOTIFY_EVENTS) {
      const entry = body.notify_prefs[ev];
      if (entry && typeof entry === 'object') {
        prefs[ev] = {};
        if (typeof entry.app === 'boolean') prefs[ev].app = entry.app;
        if (typeof entry.email === 'boolean') prefs[ev].email = entry.email;
      }
    }
    update.notify_prefs = prefs;
  }
```

- [ ] **Step 3: `src/app/api/listings/route.ts` — contact intersection**

Lines 73-81:

```ts
  const { data: sellerProfile } = await supabase
    .from('profiles')
    .select('contact_instagram, contact_email')
    .eq('id', user.id)
    .single();
  const filled = (['instagram', 'email'] as const).filter((k) => {
    const col = k === 'instagram' ? 'contact_instagram' : 'contact_email';
    return sellerProfile?.[col as keyof typeof sellerProfile];
  });
```

- [ ] **Step 4: Verify**

Run: `npm test && npx tsc --noEmit`
Expected: both pass.

Run: `grep -rn "contact_phone\|'phone'" src/app/api/`
Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/me/route.ts src/app/api/listings/route.ts
git commit -m "feat(api): drop phone from the contact allowlists and prefs

contact_phone leaves the EDITABLE allowlist, 'phone' leaves CONTACT_METHODS,
and the sms branch leaves notify_prefs parsing."
```

---

### Task 5: Narrow the shared types and validation

This task is the compiler-enforced gate on Tasks 2-4. If they were complete,
`tsc` passes immediately after the narrowing; any error names a spot they missed.

**Files:**
- Modify: `src/lib/types.ts:8,26-32`, `src/lib/validation.ts:85-87`, `src/lib/validation.test.ts:47-70`

**Interfaces:**
- Consumes: Tasks 2-4 must be complete, or this task will not compile.
- Produces: `ContactMethod = 'instagram' | 'email'`. `Profile` has no
  `contact_phone` and its `notify_prefs` values are `{ app?: boolean; email?: boolean }`.
  `ContactValues = { instagram: string | null; email: string | null }`.

- [ ] **Step 1: Update the tests first**

In `src/lib/validation.test.ts`, replace the `resolveSharedContact` fixture and
cases (lines 47-61):

```ts
describe('resolveSharedContact', () => {
  const values = { instagram: '@trojan', email: 't@usc.edu' };
  it('returns only chosen methods that have a stored value', () => {
    expect(resolveSharedContact(['instagram', 'email'], values)).toEqual({ instagram: '@trojan', email: 't@usc.edu' });
  });
  it('drops chosen methods with no stored value', () => {
    expect(resolveSharedContact(['email'], { instagram: '@t', email: null })).toEqual({});
  });
  it('ignores stored values not chosen', () => {
    expect(resolveSharedContact(['instagram'], values)).toEqual({ instagram: '@trojan' });
  });
  it('returns empty for empty chosen list', () => {
    expect(resolveSharedContact([], values)).toEqual({});
  });
});
```

Replace the `primaryMethod` block (lines 63-70):

```ts
describe('primaryMethod', () => {
  it('prefers instagram, then email', () => {
    expect(primaryMethod({ instagram: '@t', email: 'e' })).toBe('instagram');
    expect(primaryMethod({ instagram: null, email: 'e' })).toBe('email');
    expect(primaryMethod({ instagram: null, email: null })).toBe(null);
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run src/lib/validation.test.ts`
Expected: FAIL — TypeScript rejects the two-key object literals against the
three-key `ContactValues`, or the assertions fail because `METHOD_ORDER` still
contains `'phone'`.

- [ ] **Step 3: Narrow `src/lib/validation.ts`**

Lines 85-87:

```ts
type ContactValues = { instagram: string | null; email: string | null };

const METHOD_ORDER: ContactMethod[] = ['instagram', 'email'];
```

- [ ] **Step 4: Narrow `src/lib/types.ts`**

Line 8:

```ts
export type ContactMethod = 'instagram' | 'email';
```

Lines 26-32 in `Profile` — drop `contact_phone`, narrow `contact_method` to reuse
the exported union, and drop `sms`:

```ts
  contact_method: ContactMethod | null;
  contact_instagram: string | null;
  contact_email: string | null;
  bio: string | null;
  avatar_url: string | null;
  notify_prefs: Record<string, { app?: boolean; email?: boolean }> | null;
```

- [ ] **Step 5: Clean up the two bridge call sites**

Task 2 could not drop `phone` from its `primaryMethod` calls, because `ContactValues`
still required the key until Step 3 above. Both web pages therefore carry a
`phone: null` bridge that is now an excess property and will fail to compile.

In `src/app/onboarding/page.tsx` and `src/app/(app)/profile/edit/page.tsx`, change:

```tsx
          contact_method: primaryMethod({ instagram: null, phone: null, email: contacts.email.trim() || null }),
```

to:

```tsx
          contact_method: primaryMethod({ instagram: null, email: contacts.email.trim() || null }),
```

- [ ] **Step 6: Verify**

Run: `npx vitest run src/lib/validation.test.ts`
Expected: PASS.

Run: `npm test && npx tsc --noEmit`
Expected: both pass. A `tsc` error here names a consumer Tasks 2-4 missed — fix it
in place rather than widening the type back.

Run: `grep -rn "contact_phone\|phone_verif\|sms" src/ mobile/src/`
Expected: no matches.

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/validation.ts src/lib/validation.test.ts
git commit -m "refactor(types): narrow ContactMethod to instagram and email

Drops contact_phone from Profile and sms from notify_prefs. The compiler is
the real check here: this is what proves no consumer was missed."
```

---

### Task 6: Migration 035 and documentation

**Files:**
- Create: `supabase/migrations/035_remove_sms.sql`
- Modify: `docs/superpowers/specs/2026-08-06-notification-system-design.md`

**Interfaces:**
- Consumes: Tasks 1-5 must be merged and deployed before this is applied — the
  app must stop reading `contact_phone` before the column disappears.
- Produces: nothing in code. This migration is applied by a human, not by CI.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/035_remove_sms.sql`:

```sql
-- Removes the SMS channel (033_sms_consent.sql) and phone as a contact method.
-- Nothing is being switched off: sendSms had one caller and no producer ever
-- called canSms, so no user ever received a text.
--
-- This does NOT revert 033. That migration also replaced a blanket UPDATE grant
-- on profiles with an explicit column allowlist, and that hardening protects
-- every column. Only the SMS-specific parts are undone here.

-- The trigger reads phone_verified_at, so it must go before the column does.
drop trigger if exists profiles_clear_phone_verification on public.profiles;
drop function if exists public.clear_phone_verification();

drop table if exists public.phone_verifications;

-- Re-point rows whose primary method is about to stop existing. contact_email is
-- locked to the verified account and therefore always populated, so it is always
-- a safe target.
update public.profiles set contact_method = 'email' where contact_method = 'phone';

-- Narrow the constraint so the database agrees with the ContactMethod union in
-- src/lib/types.ts instead of permitting a value the app can no longer produce.
alter table public.profiles drop constraint if exists profiles_contact_method_check;
alter table public.profiles add constraint profiles_contact_method_check
  check (contact_method in ('instagram', 'email'));

alter table public.profiles
  drop column if exists phone_verified_at,
  drop column if exists sms_consent_at,
  drop column if exists contact_phone;

-- Dropping a column takes its grant with it, so this is a restatement rather
-- than a fix — it keeps the full writable allowlist readable in one place
-- instead of forcing a reader to diff it against 033.
grant update (
  display_name, handle, school_unit, class_year, bio, avatar_url,
  contact_method, contact_instagram, contact_email,
  heard_from, heard_from_detail, notify_prefs
) on public.profiles to authenticated;

-- Strip the now-dead per-event `sms` key. The coalesce is load-bearing:
-- jsonb_each over an empty '{}' yields zero rows and jsonb_object_agg over zero
-- rows returns NULL, which would blank out prefs for anyone holding '{}'.
update public.profiles
set notify_prefs = coalesce(
  (select jsonb_object_agg(key, value - 'sms') from jsonb_each(notify_prefs)),
  '{}'::jsonb
)
where notify_prefs is not null;
```

- [ ] **Step 2: Mark the subsystem removed in the design spec**

In `docs/superpowers/specs/2026-08-06-notification-system-design.md`, add this
directly under the `## Subsystem 3 — SMS Channel` heading (line 148):

```markdown
> **REMOVED 2026-08-11.** Built in phase 3, never switched on, deleted before it
> ever sent a message. See
> [2026-08-11-remove-sms-channel-design.md](2026-08-11-remove-sms-channel-design.md).
> The section below is kept as a record of what was built, not as a description
> of the system.
```

- [ ] **Step 3: Verify**

Run: `grep -rn "sms\|phone_verif\|contact_phone" src/ mobile/src/ supabase/migrations/035_remove_sms.sql`
Expected: matches only inside `035_remove_sms.sql`.

Run: `npm test && npx tsc --noEmit`
Expected: both pass.

Do NOT apply the migration as part of this task — see the operator steps.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/035_remove_sms.sql docs/superpowers/specs/2026-08-06-notification-system-design.md
git commit -m "feat(db): migration 035 drops the SMS schema and contact_phone

Re-points contact_method='phone' rows to email before the column drops, and
narrows the check constraint to match the narrowed TS union. 033's column-grant
hardening is preserved, not reverted."
```

---

## Operator steps (human only — not agent work)

1. Merge and deploy Tasks 1-5 **before** applying the migration. The app must stop
   reading `contact_phone` before the column disappears.
2. **Confirm mobile adoption of the Task 3 build before applying this migration.**
   Mobile writes `profiles` directly with the anon key, so any mobile build
   predating Task 3 still sends `contact_phone` on every profile save and will get
   `42703 column "contact_phone" of relation "profiles" does not exist` — failing
   the ENTIRE profile save, not just the phone field. Unlike web, a native deploy
   only counts once it has actually reached devices, not once it is submitted or
   released. Ship the Task 3 mobile build and confirm adoption before applying
   `035`, or knowingly accept a window where stale clients cannot save their
   profile at all.
3. **Before applying, run these two counts and report them.** `035` is
   irreversible — once it runs, there is no query left that can tell you what
   these numbers used to be.

   ```sql
   select count(*) from public.profiles where contact_email is null;
   select count(*) from public.profiles
   where contact_method = 'phone' and contact_instagram is null and contact_email is null;
   ```

   The first count is the population the migration's new backfill step will
   repair (rows with no `contact_email`, filled in from their verified
   `auth.users` address). The second is the population that, without that
   backfill, would have been re-pointed to `contact_method = null` — left with
   no contact method at all, and no editable field in either client to add one.
4. Apply `035_remove_sms.sql` in the Supabase SQL editor. **This permanently
   deletes every stored phone number.** Take a backup first if there is any doubt.
5. The check constraint is unnamed in `007_identity_contact.sql`, so it should have
   been auto-named `profiles_contact_method_check`, and `drop constraint if
   exists` should find and drop it before `add constraint` recreates it under that
   same name — that `add constraint` cannot fail on a duplicate, since the exact
   name it uses was just dropped. The real risk is a **name mismatch**: if the
   live constraint actually has a different name, `drop constraint if exists` is a
   silent no-op and `add constraint profiles_contact_method_check` succeeds
   anyway, leaving TWO check constraints on `contact_method` — the new narrow one
   plus the old, more permissive one still standing. After applying, run `\d
   public.profiles` and drop any second `contact_method` check constraint that
   survived.
6. Verify: `select count(*) from public.profiles where contact_method = 'phone';`
   returns 0, and `select contact_phone from public.profiles limit 1;` errors with
   "column does not exist".
7. **Delete these three lines from `.env.local.example`** (around lines 26-28):

   ```
   SMS_API_KEY=
   SMS_API_URL=
   SMS_FROM=
   ```

   Task 1 Step 4 required this but could not do it: env files are permission-denied
   to every agent in this environment. No later task's verification grep covers
   `.env.local.example`, so nothing else will catch it. Zero-risk edit; nothing
   reads these vars any more.
8. Remove `SMS_API_KEY`, `SMS_API_URL`, `SMS_FROM`, `SMS_WEBHOOK_SECRET` from Vercel
   (Production and Preview) if they were ever set.
9. If an SMS provider account or number was provisioned, decommission it.
