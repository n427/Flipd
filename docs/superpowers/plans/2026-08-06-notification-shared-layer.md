# Notification Shared Layer & Route Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the SMS preference/send seam and the `listing_match` event to `notify.ts`, replace the single-purpose popup-reminder cron with an isolated multi-producer sweep, and move scheduling from Vercel to Supabase pg_cron — all with zero user-visible behavior change.

**Architecture:** The Next.js route becomes a thin auth guard over `runSweep(producers)`, which runs each producer inside its own try/catch so one failure cannot suppress another. Popup-reminder logic moves out of the route into a producer module unchanged. Scheduling moves to pg_cron because Vercel's Hobby plan caps crons at daily, which cannot support the 1-hour lead time that Step 2 of the spec needs.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (`@supabase/supabase-js` service-role client), Vitest, Supabase pg_cron + pg_net + Vault.

## Global Constraints

- `wantsSms` defaults **OFF**. `wantsEmail` and `wantsPush` default ON; SMS must not follow that pattern.
- `sendSms` logs instead of sending unless **both** `SMS_API_KEY` and `SMS_API_URL` are set — mirroring `sendEmail` with no `RESEND_API_KEY`. No provider endpoint is hardcoded; the URL is configuration.
- Exactly **one** scheduled job. Do not add a second cron entry anywhere.
- Producers must be isolated: a throwing producer cannot prevent another from running.
- The sweep decides **what is due**, never **what time it is** — safe to run at any frequency, twice, or late.
- No secret values in committed SQL. `CRON_SECRET` and the app URL come from Supabase Vault.
- This step ships **no user-visible behavior change**. Popup reminders must send exactly as they do today.
- Test files live at `src/**/*.test.ts` (vitest `include` glob). Run with `npx vitest run <path>`.
- Vitest does **not** load `.env.local`, but importing `src/lib/notify.ts` in a test is still safe: `src/lib/supabase/admin.ts` builds its client lazily behind a Proxy, so no Supabase env var is read until a property is actually accessed. Tests here never touch `admin`. Do not add `setupFiles` or dotenv wiring to make these tests run.

---

### Task 1: `wantsSms` and the `listing_match` event

**Files:**
- Modify: `src/lib/notify.ts:7` (the `NotifyEvent` union), and add `wantsSms` after `wantsPush` (currently ends at line 25)
- Test: `src/lib/notify.test.ts` (create)

**Interfaces:**
- Consumes: nothing — first task.
- Produces: `wantsSms(prefs: unknown, event: NotifyEvent): boolean`, and `NotifyEvent` gains the `'listing_match'` member.

- [ ] **Step 1: Write the failing test**

Create `src/lib/notify.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { wantsSms, wantsEmail, wantsPush } from './notify';

describe('wantsSms', () => {
  it('defaults OFF when no preference is stored', () => {
    expect(wantsSms({}, 'listing_match')).toBe(false);
    expect(wantsSms(undefined, 'listing_match')).toBe(false);
    expect(wantsSms(null, 'popup_reminder')).toBe(false);
  });

  it('is on only when explicitly set to true', () => {
    expect(wantsSms({ listing_match: { sms: true } }, 'listing_match')).toBe(true);
    expect(wantsSms({ listing_match: { sms: false } }, 'listing_match')).toBe(false);
  });

  it('is per-event, not global', () => {
    const prefs = { popup_reminder: { sms: true } };
    expect(wantsSms(prefs, 'popup_reminder')).toBe(true);
    expect(wantsSms(prefs, 'listing_match')).toBe(false);
  });

  it('ignores unrelated channel keys', () => {
    expect(wantsSms({ listing_match: { email: true, app: true } }, 'listing_match')).toBe(false);
  });
});

describe('email and push keep defaulting ON for the new event', () => {
  it('treats listing_match like every other event', () => {
    expect(wantsEmail({}, 'listing_match')).toBe(true);
    expect(wantsPush({}, 'listing_match')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/notify.test.ts`
Expected: FAIL — `wantsSms is not a function`, plus TypeScript errors on `'listing_match'` not being a valid `NotifyEvent`.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/notify.ts`, extend the union on line 7:

```ts
export type NotifyEvent =
  | 'new_request' | 'approval' | 'reminder' | 'expiry'
  | 'new_message' | 'popup_reminder'
  | 'listing_match';
```

Add after `wantsPush` (after line 25):

```ts
// SMS defaults OFF — the inverse of email and push. A text nobody asked for is
// the fastest way to get a sender filtered by carriers, and an opt-out default
// would contradict what consent means. Only an explicit `true` enables it.
export function wantsSms(prefs: unknown, event: NotifyEvent): boolean {
  const p = (prefs ?? {}) as NotifyPrefs;
  return p[event]?.sms === true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/notify.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notify.ts src/lib/notify.test.ts
git commit -m "feat(notify): wantsSms (default off) and listing_match event"
```

---

### Task 2: `sendSms` provider seam

**Files:**
- Modify: `src/lib/notify.ts` — add `sendSms` after `sendEmail` (currently ends at line 60)
- Modify: `.env.local.example` — document the three SMS keys
- Test: `src/lib/notify.test.ts` (append)

**Interfaces:**
- Consumes: nothing from Task 1 at runtime; same file.
- Produces: `sendSms(to: string, body: string): Promise<void>`. Never throws. Reads `SMS_API_KEY`, `SMS_API_URL`, and `SMS_FROM` from the environment; logs instead of sending unless both `SMS_API_KEY` and `SMS_API_URL` are set.

- [ ] **Step 1: Write the failing test**

In `src/lib/notify.test.ts`, first **merge** the new names into the two existing import lines rather than adding a second pair (duplicate imports from the same module trip `no-duplicate-imports`):

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wantsSms, wantsEmail, wantsPush, sendSms } from './notify';
```

Then append:

```ts
describe('sendSms', () => {
  const realKey = process.env.SMS_API_KEY;

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.SMS_API_KEY;
  });
  afterEach(() => {
    if (realKey === undefined) delete process.env.SMS_API_KEY;
    else process.env.SMS_API_KEY = realKey;
  });

  it('logs and does not call the network when no key is set', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await sendSms('+13105550123', 'Your popup starts in an hour.');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('no SMS_API_KEY'));
  });

  it('logs and does not call the network when a key is set but no URL is', async () => {
    process.env.SMS_API_KEY = 'test-key';
    delete process.env.SMS_API_URL;
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await sendSms('+13105550123', 'hi');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('no SMS provider configured'));
  });

  it('posts to the configured URL when both are set', async () => {
    process.env.SMS_API_KEY = 'test-key';
    process.env.SMS_API_URL = 'https://sms.test/v1/send';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    await sendSms('+13105550123', 'hi');

    expect(fetchSpy).toHaveBeenCalledWith('https://sms.test/v1/send', expect.anything());
  });

  it('never throws when the provider call fails', async () => {
    process.env.SMS_API_KEY = 'test-key';
    process.env.SMS_API_URL = 'https://sms.test/v1/send';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

    await expect(sendSms('+13105550123', 'hi')).resolves.toBeUndefined();
  });
});
```

The `beforeEach`/`afterEach` above must save, clear, and restore **`SMS_API_URL`** alongside `SMS_API_KEY`, so these cases can't leak into each other:

```ts
  const realKey = process.env.SMS_API_KEY;
  const realUrl = process.env.SMS_API_URL;

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.SMS_API_KEY;
    delete process.env.SMS_API_URL;
  });
  afterEach(() => {
    if (realKey === undefined) delete process.env.SMS_API_KEY;
    else process.env.SMS_API_KEY = realKey;
    if (realUrl === undefined) delete process.env.SMS_API_URL;
    else process.env.SMS_API_URL = realUrl;
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/notify.test.ts`
Expected: FAIL — `sendSms is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/notify.ts`, after `sendEmail`:

```ts
// SMS, provider-agnostic. Deliberately shaped like sendEmail: with nothing
// configured the send is logged instead, so the whole notification path is
// testable before a provider account exists.
//
// The endpoint is an env var, not a constant, so choosing a provider in Step 3
// of the spec is a configuration change rather than a code change — and there
// is no fake URL sitting in the source pretending to be wired up.
//
// Callers must gate on wantsSms() AND the profile's verified/consent
// timestamps. This function does not check consent; it only delivers.
export async function sendSms(to: string, body: string): Promise<void> {
  const key = process.env.SMS_API_KEY;
  const url = process.env.SMS_API_URL;
  if (!key || !url) {
    console.log(`[notify] (no SMS provider configured — would send) to=${to} body="${body}"`);
    return;
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.SMS_FROM || '', to, body }),
    });
    if (!res.ok) console.error('[notify] sms failed', res.status, await res.text());
  } catch (err) {
    console.error('[notify] sms error', err);
  }
}
```

Also add the two new keys to `.env.local.example` so the shape is discoverable:

```
SMS_API_KEY=
SMS_API_URL=
SMS_FROM=
```

The request body shape (`{from, to, body}`) is a reasonable default that Step 3 adjusts to whichever provider is chosen. What matters here is that no environment has these vars set, so the send branch stays dormant.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/notify.test.ts`
Expected: PASS — 7 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notify.ts src/lib/notify.test.ts
git commit -m "feat(notify): sendSms provider seam, logs without a key"
```

---

### Task 3: `runSweep` producer harness

**Files:**
- Create: `src/lib/sweep/index.ts`
- Test: `src/lib/sweep/index.test.ts`

**Interfaces:**
- Consumes: nothing from Tasks 1–2.
- Produces:
  - `type Producer = { name: string; run: () => Promise<Record<string, number>> }`
  - `type SweepResult = { ok: true; counts: Record<string, number>; errors: { producer: string; message: string }[] }`
  - `runSweep(producers: Producer[]): Promise<SweepResult>`

- [ ] **Step 1: Write the failing test**

Create `src/lib/sweep/index.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { runSweep, type Producer } from './index';

const ok = (name: string, counts: Record<string, number>): Producer => ({
  name,
  run: async () => counts,
});
const boom = (name: string, message: string): Producer => ({
  name,
  run: async () => { throw new Error(message); },
});

describe('runSweep', () => {
  it('merges counts from every producer', async () => {
    const res = await runSweep([ok('reminders', { reminders: 3 }), ok('digest', { digests: 2 })]);
    expect(res.counts).toEqual({ reminders: 3, digests: 2 });
    expect(res.errors).toEqual([]);
  });

  it('a throwing producer does not stop the others', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await runSweep([
      boom('digest', 'model timeout'),
      ok('reminders', { reminders: 5 }),
    ]);
    expect(res.counts).toEqual({ reminders: 5 });
    expect(res.errors).toEqual([{ producer: 'digest', message: 'model timeout' }]);
  });

  it('reports every failure rather than only the first', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await runSweep([boom('a', 'x'), boom('b', 'y')]);
    expect(res.errors.map((e) => e.producer)).toEqual(['a', 'b']);
    expect(res.counts).toEqual({});
  });

  it('is ok:true even when a producer failed, so the scheduler does not retry-storm', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await runSweep([boom('a', 'x')]);
    expect(res.ok).toBe(true);
  });

  it('handles an empty producer list', async () => {
    expect(await runSweep([])).toEqual({ ok: true, counts: {}, errors: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/sweep/index.test.ts`
Expected: FAIL — cannot resolve module `./index`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/sweep/index.ts`:

```ts
// The sweep harness. One scheduled job runs every producer, and each producer
// is isolated: a failing digest must never stop popup reminders from going out.
// Producers are injected rather than imported here so the isolation guarantee
// is unit-testable without touching the database.

export type Producer = {
  name: string;
  run: () => Promise<Record<string, number>>;
};

export type SweepResult = {
  ok: true;
  counts: Record<string, number>;
  errors: { producer: string; message: string }[];
};

export async function runSweep(producers: Producer[]): Promise<SweepResult> {
  const counts: Record<string, number> = {};
  const errors: { producer: string; message: string }[] = [];

  // Sequential, not Promise.all: these all hit the same Postgres and the
  // volume is small. Ordering also keeps the logs readable when one fails.
  for (const p of producers) {
    try {
      Object.assign(counts, await p.run());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[sweep] producer "${p.name}" failed`, err);
      errors.push({ producer: p.name, message });
    }
  }

  // Always ok:true. A partial failure is reported in `errors` but must not
  // return non-2xx — pg_net would treat that as a failed call and the real
  // signal (which producer broke) would be buried in scheduler noise.
  return { ok: true, counts, errors };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/sweep/index.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sweep/index.ts src/lib/sweep/index.test.ts
git commit -m "feat(sweep): isolated producer harness"
```

---

### Task 4: Move popup reminders into a producer and rename the route

**Files:**
- Create: `src/lib/sweep/popup-reminders.ts`
- Create: `src/app/api/cron/sweep/route.ts`
- Delete: `src/app/api/cron/popup-reminders/route.ts`

**Interfaces:**
- Consumes: `runSweep`, `Producer` from Task 3 (`src/lib/sweep/index.ts`).
- Produces: `popupRemindersProducer: Producer` — `name: 'popup_reminders'`, resolving to `{ reminders: n }`.

**Behavior must not change.** The logic moves verbatim; only its container changes. The 24h lookahead and single `reminded_at` flag stay exactly as they are — the two-stage split is Step 2 of the spec, not this task.

- [ ] **Step 1: Create the producer by moving the existing logic**

Create `src/lib/sweep/popup-reminders.ts`. Copy the body of the current `GET` in `src/app/api/cron/popup-reminders/route.ts` from `const now = Date.now();` (line 23) through the loop, dropping the auth guard and the `NextResponse` wrappers:

```ts
import { admin } from '@/lib/supabase/admin';
import { formatEventWindow } from '@/lib/validation';
import { popupReminderEmail, sendEmail, verifiedEmailFor, wantsEmail } from '@/lib/notify';
import type { Producer } from './index';

// Unchanged from the old /api/cron/popup-reminders route: emails each opted-in
// buyer once for popups starting within the next 24h, then marks the reminder
// sent. The two-stage 24h/1h split is a later step; this move is behavior-
// preserving on purpose so the scheduler swap can be verified in isolation.
async function run(): Promise<Record<string, number>> {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const soonIso = new Date(now + 24 * 60 * 60 * 1000).toISOString();

  const { data: pending, error: pendingError } = await admin
    .from('popup_reminders')
    .select('user_id, listing_id')
    .is('reminded_at', null);
  if (pendingError) throw new Error(pendingError.message);

  const rows = pending ?? [];
  if (rows.length === 0) return { reminders: 0 };

  const listingIds = Array.from(new Set(rows.map((r) => r.listing_id)));
  const { data: listings, error: listingsError } = await admin
    .from('listings')
    .select('id, title, event_start, event_end')
    .in('id', listingIds)
    .gte('event_start', nowIso)
    .lte('event_start', soonIso);
  if (listingsError) throw new Error(listingsError.message);

  const listingById = new Map((listings ?? []).map((l) => [l.id, l]));

  let sent = 0;
  for (const r of rows) {
    const listing = listingById.get(r.listing_id);
    if (!listing) continue; // not starting within the next 24h (or gone)

    const { data: profile } = await admin
      .from('profiles')
      .select('notify_prefs')
      .eq('id', r.user_id)
      .single();

    if (wantsEmail(profile?.notify_prefs, 'popup_reminder')) {
      const to = await verifiedEmailFor(r.user_id);
      if (to) {
        const when = formatEventWindow(listing.event_start, listing.event_end);
        const { subject, html } = popupReminderEmail(listing.title, when);
        await sendEmail(to, subject, html);
        sent++;
      }
    }

    // Mark reminded regardless of send outcome so a bad address or an opt-out
    // doesn't retry this row every run.
    await admin
      .from('popup_reminders')
      .update({ reminded_at: new Date().toISOString() })
      .eq('user_id', r.user_id)
      .eq('listing_id', r.listing_id);
  }

  return { reminders: sent };
}

export const popupRemindersProducer: Producer = { name: 'popup_reminders', run };
```

Note the one deliberate change: the old route returned `NextResponse.json({error}, {status:500})` on a query error. A producer **throws** instead, so `runSweep` records it in `errors` and other producers still run.

- [ ] **Step 2: Create the new route**

Create `src/app/api/cron/sweep/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { runSweep } from '@/lib/sweep';
import { popupRemindersProducer } from '@/lib/sweep/popup-reminders';

// Secret-guarded sweep, called hourly by Supabase pg_cron with
// `Authorization: Bearer $CRON_SECRET`. Every producer decides what is DUE
// rather than what time it is, so running late, twice, or at any frequency is
// safe. Adding a producer means adding it to the array below — never a second
// cron entry.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await runSweep([popupRemindersProducer]);
  return NextResponse.json(result);
}
```

- [ ] **Step 3: Delete the old route**

```bash
git rm src/app/api/cron/popup-reminders/route.ts
```

- [ ] **Step 4: Verify the whole suite and types still pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc exits 0; all tests pass.

- [ ] **Step 5: Verify the route responds correctly**

With `npm run dev` running:

```bash
curl -s -o /dev/null -w "no auth  -> %{http_code}\n" http://localhost:3000/api/cron/sweep
curl -s -w "\n" -H "Authorization: Bearer $(grep -E '^CRON_SECRET' .env.local | cut -d= -f2-)" \
  http://localhost:3000/api/cron/sweep
curl -s -o /dev/null -w "old route gone -> %{http_code}\n" http://localhost:3000/api/cron/popup-reminders
```

Expected: `401`; then `{"ok":true,"counts":{"reminders":0},"errors":[]}` (0 unless real reminders are due); then `404`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sweep/popup-reminders.ts src/app/api/cron/sweep/route.ts
git commit -m "refactor(cron): popup reminders become a sweep producer at /api/cron/sweep"
```

---

### Task 5: Move scheduling to pg_cron

**Files:**
- Modify: `vercel.json` — remove the `crons` array
- Create: `supabase/migrations/031_sweep_schedule.sql`

**Interfaces:**
- Consumes: the `/api/cron/sweep` route from Task 4.
- Produces: `supabase/migrations/031_sweep_schedule.sql`, which when applied creates a pg_cron job named `flipd-sweep-hourly`.

**Scope note:** this task writes and commits files only. Creating the Vault secrets, applying the migration to the hosted project, and confirming the first run all require Supabase dashboard access and a wall-clock wait — they are in the Operator Runbook at the end of this plan and are **not** part of this task. Do not attempt them, and do not treat the task as incomplete for not having done them.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/031_sweep_schedule.sql`:

```sql
-- Hourly sweep, scheduled in Postgres rather than vercel.json. Vercel's Hobby
-- plan caps crons at once per day, which cannot support the 1h popup-reminder
-- lead time; pg_cron is free at any frequency.
--
-- Secrets come from Vault so no key is committed. Create them once with:
--   select vault.create_secret('<app url>',      'app_url');
--   select vault.create_secret('<cron secret>',  'cron_secret');
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Idempotent: unschedule first so re-running this migration doesn't stack jobs.
select cron.unschedule('flipd-sweep-hourly')
where exists (select 1 from cron.job where jobname = 'flipd-sweep-hourly');

select cron.schedule(
  'flipd-sweep-hourly',
  '0 * * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url')
           || '/api/cron/sweep',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    )
  );
  $$
);
```

- [ ] **Step 2: Remove the Vercel cron**

Replace `vercel.json` entirely with:

```json
{}
```

The only key it held was `crons`. Leaving the daily entry would run a second scheduler against the same endpoint — harmless because the sent-flags make it idempotent, but it hides which scheduler is actually live.

- [ ] **Step 3: Verify both files are well-formed**

```bash
node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('vercel.json parses')"
test -f supabase/migrations/031_sweep_schedule.sql && echo "migration present"
npx tsc --noEmit && echo "types ok"
```

Expected: all three lines print. There is no unit test for this task — it produces SQL and config, not code paths. Correctness is verified by the Operator Runbook below, against the real project.

- [ ] **Step 4: Commit**

```bash
git add vercel.json supabase/migrations/031_sweep_schedule.sql
git commit -m "feat(sweep): hourly pg_cron schedule, drop the vercel daily cron"
```

---

## Operator Runbook (human, after Task 5)

These three steps need Supabase dashboard access and a wall-clock wait, so they sit outside the task loop. Until they are done the sweep is **not scheduled** — and because Task 4 deletes the old route while Task 5 removes the Vercel cron, popup reminders are paused in the gap. Run these promptly after the branch merges.

**1. Create the Vault secrets** (SQL editor, values never committed):

```sql
select vault.create_secret('https://www.flipdcampus.com', 'app_url');
select vault.create_secret('<the CRON_SECRET value from Vercel>', 'cron_secret');
select name from vault.decrypted_secrets;   -- expect both listed
```

**2. Apply the migration, then confirm the job exists:**

```sql
select jobname, schedule, active from cron.job where jobname = 'flipd-sweep-hourly';
```

Expected: one row, `0 * * * *`, `active = true`.

**3. After the next hour boundary, confirm it fires:**

```sql
select status, return_message, start_time
from cron.job_run_details
where jobname = 'flipd-sweep-hourly'
order by start_time desc limit 3;
```

Expected: `status = 'succeeded'`. A `401` in `return_message` means the Vault `cron_secret` doesn't match Vercel's `CRON_SECRET`. A DNS or connection error means `app_url` is wrong.

---

## Verification

After all five tasks:

- `npx vitest run` — all tests pass (14 new: 9 in `notify.test.ts`, 5 in `sweep/index.test.ts`)
- `npx tsc --noEmit` — exits 0
- `GET /api/cron/sweep` without auth → `401`; with the secret → `{"ok":true,"counts":{"reminders":N},"errors":[]}`
- `GET /api/cron/popup-reminders` → `404`
- `cron.job` has exactly one Flipd row; `vercel.json` has no `crons` key
- **No user-visible change once the Operator Runbook is done.** Between merge and runbook completion, reminders are paused — the old route is gone and the new schedule isn't live yet

## Out of Scope for This Plan

Deferred to later steps of the spec, and explicitly **not** to be built here:

- Two-stage 24h/1h reminders and the `reminded_1h_at` column (Step 2)
- `phone_verified_at`, `sms_consent_at`, verification flow, STOP webhook, real provider (Step 3)
- `search_events`, interest profiles, the matcher, `last_digest_at`, quiet hours (Step 4)
- The `listing_match` email/push/SMS templates the spec calls for. The event name lands in Task 1 because the type is shared, but templates with no producer to send them are dead code — they belong with the digest in Step 4
- Sending push or SMS for popup reminders — today's route emails only, and that stays true here
