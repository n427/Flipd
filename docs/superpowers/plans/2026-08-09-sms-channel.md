# SMS Channel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SMS a real delivery channel alongside email and push — phone ownership verified by code, texting consented to separately, and STOP honored — without sending a single message until a provider is configured.

**Architecture:** Three independent gates govern every SMS: the number is verified, the user consented to texts, and they want that event. Verification codes are hashed at rest with a short expiry and an attempt cap. Because mobile writes `profiles` directly through Supabase rather than through `/api/me`, "changing your number clears verification" is enforced by a database trigger, not route logic.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (service-role client + RLS), Node `crypto`, Vitest.

## Global Constraints

- **Three gates, all required, all independent:** `phone_verified_at != null` AND `sms_consent_at != null` AND `wantsSms(prefs, event)`. Verifying a number is not consent to be texted; consenting to texts is not consent to every event.
- **Nobody receives SMS on deploy.** Existing rows have both timestamps null, so the rollout is safe by construction rather than by care.
- **Never store a verification code in plaintext.** Store a hash; compare hashes.
- **The trigger is the enforcement point, not the route.** `mobile/src/lib/listings.ts:657` updates `profiles` directly via Supabase, so route-level clearing would silently not fire for mobile users. Any route logic is a convenience on top, never the guarantee.
- **No message is sent anywhere in this plan.** `sendSms` already logs instead of sending unless both `SMS_API_KEY` and `SMS_API_URL` are set, and neither is set in any environment. Do not set them.
- **The webhook must authenticate.** An unauthenticated endpoint that clears consent by phone number lets anyone unsubscribe anyone.
- Test files live at `src/**/*.test.ts`. Run with `npx vitest run <path>`.
- Comments explain WHY, not WHAT — match `src/lib/notify.ts`.

## Out of Scope

- Choosing an SMS provider, and 10DLC brand/campaign registration. Both are operational and gate real sending, not this code.
- Sending SMS for any event. This plan builds the channel; wiring producers to it comes after a provider exists.
- Any UI. These are API routes; the settings screens come later.
- Internationalization of phone numbers. USC-only, US numbers.

---

### Task 1: Migration — consent columns, code storage, and the trigger

**Files:**
- Create: `supabase/migrations/033_sms_consent.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `profiles.phone_verified_at`, `profiles.sms_consent_at`, table `public.phone_verifications`, and trigger `profiles_clear_phone_verification`.

**Scope note:** writes the file only. Applying it needs dashboard access and is in the Operator Runbook. Do not apply it or connect to any database.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/033_sms_consent.sql`:

```sql
-- SMS becomes a delivery channel. Two timestamps rather than one boolean,
-- because owning a number and agreeing to be texted are different facts and a
-- single flag cannot express "verified but opted out".
alter table public.profiles
  add column if not exists phone_verified_at timestamptz,
  add column if not exists sms_consent_at    timestamptz;

-- Pending verification codes. The code itself is never stored — only a hash —
-- so a leak of this table cannot be replayed. Short expiry plus an attempt cap
-- is what actually protects a 6-digit code; the hash protects it at rest.
create table if not exists public.phone_verifications (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  phone      text        not null,
  code_hash  text        not null,
  expires_at timestamptz not null,
  attempts   int         not null default 0,
  sent_at    timestamptz not null default now()
);

-- One pending code per user: a new request replaces the old row, so an
-- abandoned code cannot be used later.
alter table public.phone_verifications enable row level security;

-- No policies on purpose. Only the service-role client touches this table, and
-- service role bypasses RLS. With RLS on and zero policies, a leaked anon key
-- reads nothing.

-- Changing the contact number must invalidate verification and consent. This
-- lives in the database, not in an API route, because mobile updates profiles
-- directly through Supabase (mobile/src/lib/listings.ts:657) and never passes
-- through /api/me. Route-level clearing would silently not fire for phones —
-- leaving a "verified" flag pointing at a number the user no longer owns.
create or replace function public.clear_phone_verification()
returns trigger
language plpgsql
as $$
begin
  if new.contact_phone is distinct from old.contact_phone then
    new.phone_verified_at := null;
    new.sms_consent_at    := null;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_clear_phone_verification on public.profiles;
create trigger profiles_clear_phone_verification
  before update on public.profiles
  for each row
  execute function public.clear_phone_verification();
```

`is distinct from` rather than `<>` is deliberate: it treats null correctly, so both setting a number for the first time and clearing it are handled without a null-comparison trap.

- [ ] **Step 2: Verify numbering and syntax shape**

```bash
ls supabase/migrations/ | tail -3
test -f supabase/migrations/033_sms_consent.sql && echo "present"
grep -c "is distinct from" supabase/migrations/033_sms_consent.sql
```

Expected: `033_sms_consent.sql` is highest, following `032_two_stage_popup_reminders.sql`; `present`; `1`. If 033 is taken, STOP and report.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/033_sms_consent.sql
git commit -m "feat(sms): consent columns, hashed code storage, phone-change trigger"
```

---

### Task 2: `canSms` — the three-gate check

**Files:**
- Modify: `src/lib/notify.ts` — add `canSms` after `wantsSms` (currently ends line 33)
- Test: `src/lib/notify.test.ts` (append)

**Interfaces:**
- Consumes: `wantsSms`, `NotifyEvent` (same file).
- Produces:

```ts
export type SmsProfile = {
  phone_verified_at: string | null;
  sms_consent_at: string | null;
  notify_prefs: unknown;
};

export function canSms(profile: SmsProfile | null | undefined, event: NotifyEvent): boolean;
```

- [ ] **Step 1: Write the failing test**

Append to `src/lib/notify.test.ts` (merge `canSms` into the existing `./notify` import line):

```ts
describe('canSms', () => {
  const ok = {
    phone_verified_at: '2026-08-01T00:00:00.000Z',
    sms_consent_at: '2026-08-01T00:00:00.000Z',
    notify_prefs: { popup_reminder: { sms: true } },
  };

  it('allows only when all three gates pass', () => {
    expect(canSms(ok, 'popup_reminder')).toBe(true);
  });

  it('blocks an unverified number even with consent and preference', () => {
    expect(canSms({ ...ok, phone_verified_at: null }, 'popup_reminder')).toBe(false);
  });

  it('blocks without consent even when verified and preferred', () => {
    expect(canSms({ ...ok, sms_consent_at: null }, 'popup_reminder')).toBe(false);
  });

  it('blocks an event the user did not opt into, even when verified and consented', () => {
    expect(canSms(ok, 'listing_match')).toBe(false);
  });

  it('blocks a missing profile rather than defaulting open', () => {
    expect(canSms(null, 'popup_reminder')).toBe(false);
    expect(canSms(undefined, 'popup_reminder')).toBe(false);
  });

  it('blocks when every gate is closed', () => {
    expect(canSms({ phone_verified_at: null, sms_consent_at: null, notify_prefs: {} }, 'popup_reminder')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/notify.test.ts`
Expected: FAIL — `canSms is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/notify.ts`, after `wantsSms`:

```ts
export type SmsProfile = {
  phone_verified_at: string | null;
  sms_consent_at: string | null;
  notify_prefs: unknown;
};

// Three independent gates, all required. Owning a number is not agreeing to be
// texted, and agreeing to be texted is not agreeing to every event — so these
// can never collapse into one flag. A missing profile fails closed: the caller
// could not prove consent, which is the same as not having it.
export function canSms(profile: SmsProfile | null | undefined, event: NotifyEvent): boolean {
  if (!profile) return false;
  return (
    profile.phone_verified_at != null &&
    profile.sms_consent_at != null &&
    wantsSms(profile.notify_prefs, event)
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/notify.test.ts`
Expected: PASS — 18 tests (12 existing + 6 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/notify.ts src/lib/notify.test.ts
git commit -m "feat(sms): canSms three-gate check"
```

---

### Task 3: Verification code helpers

**Files:**
- Create: `src/lib/sms/verification.ts`
- Test: `src/lib/sms/verification.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:

```ts
export const CODE_TTL_MS: number;      // 10 * 60 * 1000
export const MAX_ATTEMPTS: number;     // 5
export const RESEND_COOLDOWN_MS: number; // 60 * 1000

export function generateCode(): string;                      // 6 digits, zero-padded
export function hashCode(code: string, userId: string): string;
export function normalizePhone(raw: string): string | null;  // E.164, or null if not a valid US number
export function isStopKeyword(body: string): boolean;
```

- [ ] **Step 1: Write the failing test**

Create `src/lib/sms/verification.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  generateCode, hashCode, normalizePhone, isStopKeyword,
  CODE_TTL_MS, MAX_ATTEMPTS,
} from './verification';

describe('generateCode', () => {
  it('is always six digits, including when the value is small', () => {
    for (let i = 0; i < 200; i++) expect(generateCode()).toMatch(/^\d{6}$/);
  });

  it('is not constant', () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateCode()));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('hashCode', () => {
  it('is deterministic for the same code and user', () => {
    expect(hashCode('123456', 'u1')).toBe(hashCode('123456', 'u1'));
  });

  it('differs across users, so one leaked hash does not unlock another account', () => {
    expect(hashCode('123456', 'u1')).not.toBe(hashCode('123456', 'u2'));
  });

  it('never returns the code itself', () => {
    expect(hashCode('123456', 'u1')).not.toContain('123456');
  });
});

describe('normalizePhone', () => {
  it('accepts common US formats and returns E.164', () => {
    expect(normalizePhone('(310) 555-0123')).toBe('+13105550123');
    expect(normalizePhone('310-555-0123')).toBe('+13105550123');
    expect(normalizePhone('3105550123')).toBe('+13105550123');
    expect(normalizePhone('+1 310 555 0123')).toBe('+13105550123');
    expect(normalizePhone('13105550123')).toBe('+13105550123');
  });

  it('rejects anything that is not a plausible US number', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('555')).toBeNull();
    expect(normalizePhone('not a phone')).toBeNull();
    expect(normalizePhone('+44 20 7946 0958')).toBeNull();
    expect(normalizePhone('31055501234567')).toBeNull();
  });
});

describe('isStopKeyword', () => {
  it('recognises the carrier-mandated opt-out words, case and space insensitive', () => {
    for (const w of ['STOP', 'stop', '  Stop  ', 'STOPALL', 'unsubscribe', 'CANCEL', 'end', 'quit']) {
      expect(isStopKeyword(w)).toBe(true);
    }
  });

  it('does not treat an ordinary message as an opt-out', () => {
    expect(isStopKeyword('stop by the popup later!')).toBe(false);
    expect(isStopKeyword('yes')).toBe(false);
    expect(isStopKeyword('')).toBe(false);
  });
});

describe('constants', () => {
  it('keeps the code short-lived and attempt-capped', () => {
    expect(CODE_TTL_MS).toBe(10 * 60 * 1000);
    expect(MAX_ATTEMPTS).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/sms/verification.test.ts`
Expected: FAIL — cannot resolve module `./verification`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/sms/verification.ts`:

```ts
import { createHash, randomInt } from 'crypto';

// A 6-digit code has only a million possibilities, so the hash is not what
// makes it safe — the attempt cap and the short expiry are. The hash exists so
// that a leak of the table cannot be replayed directly.
export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_MS = 60 * 1000;

// randomInt, not Math.random: this is a credential, however short-lived.
export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

// Salted with the user id so one stolen hash cannot be tested against every
// other pending code in the table.
export function hashCode(code: string, userId: string): string {
  return createHash('sha256').update(`${userId}:${code}`).digest('hex');
}

// US numbers only — Flipd is USC-only, and accepting international formats
// would mean carrier rules and costs this build does not handle.
export function normalizePhone(raw: string): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

// Carriers require these to work regardless of what our app thinks. Matched
// only when the whole message is the keyword, so "stop by the popup" is a
// message, not an opt-out.
const STOP_WORDS = new Set(['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit']);
export function isStopKeyword(body: string): boolean {
  return STOP_WORDS.has((body ?? '').trim().toLowerCase());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/sms/verification.test.ts`
Expected: PASS — 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sms/verification.ts src/lib/sms/verification.test.ts
git commit -m "feat(sms): verification code helpers"
```

---

### Task 4: Verification routes

**Files:**
- Create: `src/app/api/me/phone/start/route.ts`
- Create: `src/app/api/me/phone/confirm/route.ts`

**Interfaces:**
- Consumes: `generateCode`, `hashCode`, `normalizePhone`, `CODE_TTL_MS`, `MAX_ATTEMPTS`, `RESEND_COOLDOWN_MS` from `@/lib/sms/verification`; `sendSms` from `@/lib/notify`; `getRequestUser` from `@/lib/supabase/authAny`; `admin` from `@/lib/supabase/admin`.
- Produces: `POST /api/me/phone/start` and `POST /api/me/phone/confirm`.

Both use `getRequestUser` (not `getSessionUser`) so web cookie sessions and mobile Bearer tokens both work — mirroring `src/app/api/reveals/route.ts`.

- [ ] **Step 1: Write the start route**

Create `src/app/api/me/phone/start/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { getRequestUser } from '@/lib/supabase/authAny';
import { sendSms } from '@/lib/notify';
import { generateCode, hashCode, normalizePhone, CODE_TTL_MS, RESEND_COOLDOWN_MS } from '@/lib/sms/verification';

// Send a verification code to a phone number. Upserts one pending code per
// user, so requesting a new code invalidates the previous one rather than
// leaving several valid at once.
export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { phone } = await req.json().catch(() => ({}));
  const e164 = typeof phone === 'string' ? normalizePhone(phone) : null;
  if (!e164) {
    return NextResponse.json({ error: 'Enter a valid US phone number.' }, { status: 400 });
  }

  // Cooldown before anything is sent. Each code costs money and a tight loop
  // here is both an abuse vector and a way to get a sender flagged.
  const { data: existing } = await admin
    .from('phone_verifications')
    .select('sent_at')
    .eq('user_id', user.id)
    .maybeSingle();
  if (existing?.sent_at && Date.now() - new Date(existing.sent_at).getTime() < RESEND_COOLDOWN_MS) {
    return NextResponse.json({ error: 'Wait a minute before requesting another code.' }, { status: 429 });
  }

  const code = generateCode();
  const { error } = await admin.from('phone_verifications').upsert(
    {
      user_id: user.id,
      phone: e164,
      code_hash: hashCode(code, user.id),
      expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
      attempts: 0,
      sent_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await sendSms(e164, `Your Flipd verification code is ${code}. It expires in 10 minutes.`);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Write the confirm route**

Create `src/app/api/me/phone/confirm/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { getRequestUser } from '@/lib/supabase/authAny';
import { hashCode, MAX_ATTEMPTS } from '@/lib/sms/verification';

// Check a code and, on success, mark the number verified. Consent is NOT
// granted here — agreeing to be texted is a separate act, so this only proves
// ownership.
export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { code } = await req.json().catch(() => ({}));
  if (typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) {
    return NextResponse.json({ error: 'Enter the 6-digit code.' }, { status: 400 });
  }

  const { data: row } = await admin
    .from('phone_verifications')
    .select('phone, code_hash, expires_at, attempts')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: 'Request a code first.' }, { status: 400 });

  if (new Date(row.expires_at).getTime() < Date.now()) {
    await admin.from('phone_verifications').delete().eq('user_id', user.id);
    return NextResponse.json({ error: 'That code expired. Request a new one.' }, { status: 400 });
  }

  if (row.attempts >= MAX_ATTEMPTS) {
    await admin.from('phone_verifications').delete().eq('user_id', user.id);
    return NextResponse.json({ error: 'Too many attempts. Request a new code.' }, { status: 429 });
  }

  if (hashCode(code.trim(), user.id) !== row.code_hash) {
    // Count the failure before answering, so a burst of guesses cannot outrun
    // the increment.
    await admin
      .from('phone_verifications')
      .update({ attempts: row.attempts + 1 })
      .eq('user_id', user.id);
    return NextResponse.json({ error: 'That code is not right.' }, { status: 400 });
  }

  // TWO statements, in this order, and it must stay that way. The before-update
  // trigger assigns new.phone_verified_at := null whenever contact_phone
  // differs from the old value — it would clobber the timestamp if both were
  // set in a single update. So: write the number first and let the trigger
  // clear (it is clearing values that are already null or stale), then set the
  // timestamp in a second update that leaves contact_phone untouched, which
  // the trigger ignores.
  const { error: phoneError } = await admin
    .from('profiles')
    .update({ contact_phone: row.phone })
    .eq('id', user.id);
  if (phoneError) return NextResponse.json({ error: phoneError.message }, { status: 500 });

  const { error: stampError } = await admin
    .from('profiles')
    .update({ phone_verified_at: new Date().toISOString() })
    .eq('id', user.id);
  if (stampError) return NextResponse.json({ error: stampError.message }, { status: 500 });

  await admin.from('phone_verifications').delete().eq('user_id', user.id);
  return NextResponse.json({ ok: true, phone: row.phone });
}
```

**Why two statements and not one:** the trigger fires `before update` and unconditionally nulls `phone_verified_at` when `contact_phone` changed, so an explicit `phone_verified_at` in that same statement is overwritten and the user is never marked verified. Splitting it means the second update does not touch `contact_phone`, `is distinct from` is false, and the trigger leaves the timestamp alone. If a future change collapses these back into one update, verification silently stops working — the route returns `ok` and the flag stays null.

- [ ] **Step 3: Verify types and the suite**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: tsc exits 0; all tests pass. These routes have no unit tests by design — they are thin glue over tested helpers, and mocking the Supabase client would test the mock.

- [ ] **Step 4: Verify the routes answer**

With `npm run dev` running (check `lsof -nP -iTCP:3000 -sTCP:LISTEN` first):

```bash
curl -s -o /dev/null -w "start   no auth -> %{http_code}\n" -X POST http://localhost:3000/api/me/phone/start
curl -s -o /dev/null -w "confirm no auth -> %{http_code}\n" -X POST http://localhost:3000/api/me/phone/confirm
```

Expected: both `401`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/me/phone/start/route.ts src/app/api/me/phone/confirm/route.ts
git commit -m "feat(sms): phone verification start and confirm routes"
```

---

### Task 5: Consent toggle and the STOP webhook

**Files:**
- Create: `src/app/api/me/sms-consent/route.ts`
- Create: `src/app/api/sms/webhook/route.ts`
- Modify: `.env.local.example` — add `SMS_WEBHOOK_SECRET` **(see the note below; this may be blocked)**

**Interfaces:**
- Consumes: `isStopKeyword`, `normalizePhone` from `@/lib/sms/verification`; `getRequestUser`, `admin`.
- Produces: `POST /api/me/sms-consent` (grant or revoke) and `POST /api/sms/webhook`.

- [ ] **Step 1: Write the consent route**

Create `src/app/api/me/sms-consent/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { getRequestUser } from '@/lib/supabase/authAny';

// Grant or revoke consent to be texted. Separate from verification on purpose:
// proving you own a number is not agreeing to receive messages at it.
export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { consent } = await req.json().catch(() => ({}));
  if (typeof consent !== 'boolean') {
    return NextResponse.json({ error: 'consent must be true or false' }, { status: 400 });
  }

  if (consent) {
    // Consent is meaningless on an unverified number — we would be agreeing on
    // behalf of whoever actually owns it.
    const { data: profile } = await admin
      .from('profiles')
      .select('phone_verified_at')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile?.phone_verified_at) {
      return NextResponse.json({ error: 'Verify your phone number first.' }, { status: 400 });
    }
  }

  const { error } = await admin
    .from('profiles')
    .update({ sms_consent_at: consent ? new Date().toISOString() : null })
    .eq('id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, consent });
}
```

- [ ] **Step 2: Write the STOP webhook**

Create `src/app/api/sms/webhook/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { isStopKeyword, normalizePhone } from '@/lib/sms/verification';

// Inbound SMS from the provider. Honoring STOP is a carrier requirement, not a
// feature — a sender that ignores it gets filtered regardless of what the law
// says.
//
// Shared-secret auth rather than a provider signature, because the provider is
// not chosen yet and signature schemes are provider-specific. Without this an
// anonymous caller could unsubscribe any number they can guess. Swap in real
// signature verification when the provider is picked.
export async function POST(req: NextRequest) {
  const secret = process.env.SMS_WEBHOOK_SECRET;
  const auth = req.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { from, body } = await req.json().catch(() => ({}));
  const e164 = typeof from === 'string' ? normalizePhone(from) : null;
  if (!e164 || typeof body !== 'string') {
    return NextResponse.json({ error: 'from and body required' }, { status: 400 });
  }

  if (!isStopKeyword(body)) {
    // Not an opt-out. Acknowledge so the provider does not retry; there is no
    // inbound-message feature to route it to.
    return NextResponse.json({ ok: true, action: 'ignored' });
  }

  // Revoke consent, leaving verification intact — they still own the number,
  // they just do not want texts. Matching on contact_phone is why the trigger
  // matters: a stale number here would revoke the wrong person's consent.
  const { error } = await admin
    .from('profiles')
    .update({ sms_consent_at: null })
    .eq('contact_phone', e164);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, action: 'stopped' });
}
```

- [ ] **Step 3: Document the new env var**

Add to `.env.local.example`:

```
SMS_WEBHOOK_SECRET=
```

**If this file cannot be read or edited, that is expected** — a permission rule denies all agent access to `.env.*` paths. Do not attempt to work around it. Note it in your report as not done and continue; the plan's Operator Runbook hands it to a human.

- [ ] **Step 4: Verify types, suite, and routes**

```bash
npx tsc --noEmit && npx vitest run
```

With the dev server running:

```bash
curl -s -o /dev/null -w "consent no auth -> %{http_code}\n" -X POST http://localhost:3000/api/me/sms-consent
curl -s -o /dev/null -w "webhook no auth -> %{http_code}\n" -X POST http://localhost:3000/api/sms/webhook
```

Expected: tsc exits 0, all tests pass, both curls `401`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/me/sms-consent/route.ts src/app/api/sms/webhook/route.ts
git commit -m "feat(sms): consent toggle and STOP webhook"
```

---

## Verification

- `npx vitest run` — all pass, 16 new across Tasks 2 and 3
- `npx tsc --noEmit` — exits 0
- All four new routes return `401` unauthenticated
- No message is sent anywhere: `SMS_API_KEY` and `SMS_API_URL` remain unset in every environment, so `sendSms` only logs
- `git diff --name-only` includes no mobile file and no existing route

## Operator Runbook (human, after merge)

**1.** Apply `supabase/migrations/033_sms_consent.sql`, then confirm the trigger exists:

```sql
select tgname from pg_trigger where tgname = 'profiles_clear_phone_verification';
```

**2.** Confirm the trigger actually fires — this is the guarantee the whole design rests on:

```sql
-- against a throwaway test profile, not a real user
update public.profiles set phone_verified_at = now(), sms_consent_at = now()
where id = '<test uuid>';
update public.profiles set contact_phone = '+13105550199' where id = '<test uuid>';
select phone_verified_at, sms_consent_at from public.profiles where id = '<test uuid>';
```

Expected: both null after the phone change.

**2b.** Confirm the counterpart — that a verification can still stick despite the trigger. Set a phone and then stamp the flag in a *second* statement, as the confirm route does:

```sql
update public.profiles set contact_phone = '+13105550188' where id = '<test uuid>';
update public.profiles set phone_verified_at = now()      where id = '<test uuid>';
select contact_phone, phone_verified_at from public.profiles where id = '<test uuid>';
```

Expected: the phone is set AND `phone_verified_at` is non-null. If it comes back null, the trigger is firing on the second statement too and the confirm route cannot work — stop and investigate before shipping.

**3.** Add `SMS_WEBHOOK_SECRET` to Vercel (any long random string) and to `.env.local`. Redeploy — env changes need one.

**4.** When a provider is chosen: set `SMS_API_KEY` and `SMS_API_URL`, adjust the request body shape in `sendSms` to match that provider, point the provider's inbound webhook at `/api/sms/webhook` with the `Authorization: Bearer $SMS_WEBHOOK_SECRET` header, and replace the shared-secret check with that provider's signature verification. Complete 10DLC registration before expecting real delivery.
