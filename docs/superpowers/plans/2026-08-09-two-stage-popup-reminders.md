# Two-Stage Popup Reminders (24h + 1h) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send a popup reminder twice — once about a day ahead, once about an hour ahead — instead of the single 24h reminder that exists today.

**Architecture:** The decision of what to send is extracted into a pure function, `dueReminders(rows, listings, now)`, so every timing rule is unit-testable with a fixed clock and no database. The producer becomes fetch → decide → send/stamp. Two non-overlapping windows replace the single flag: `(1h, 24h]` for the day-ahead notice and `(0, 1h]` for the imminent one, each with its own sent-flag.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (service-role client), Vitest, Supabase pg_cron.

## Global Constraints

- The windows are **non-overlapping**: 24h stage is `1h < Δ ≤ 24h`, 1h stage is `0 < Δ ≤ 1h`, where `Δ = event_start − now`. A reminder is never sent from both stages at once.
- **Suppression, not late delivery.** The 24h notice is stamped *without sending* in two cases, both from the approved spec: (a) the user opted in when the event was already less than 24h away — they just looked at it, a "tomorrow" email minutes later is noise; (b) the event is already inside the 1h window with the 24h flag still null, which means the sweep missed runs. Either way a "tomorrow!" email hours or minutes beforehand is worse than silence.
- Decide **what is due**, never **what time it is**. A late sweep still delivers; it never double-sends.
- Both flags are stamped **regardless of send outcome** (opted out, no verified email) so a dead row isn't retried every hour.
- **No client changes.** `/api/popup-reminders` and `mobile/src/lib/listings.ts` insert `(user_id, listing_id)` and nothing else. Keep it that way — all timing logic lives in the sweep.
- Events that have already started, and archived or deleted listings, produce nothing.
- Test files live at `src/**/*.test.ts`. Run with `npx vitest run <path>`.
- Comments explain WHY, not WHAT — match `src/lib/notify.ts`.

## Deploy Ordering

Migration 032 renames a column the running producer reads. Whichever lands first, there is a window where the producer errors — it throws, `runSweep` catches it, the other producers keep running, and the error appears in the route's `errors` array. Nothing crashes and nothing is lost: the flags stay null, so the next hourly run delivers whatever was due. Apply the migration and deploy the code close together and the window is minutes. This is stated in the Operator Runbook at the end.

---

### Task 1: Migration — split the sent-flag in two

**Files:**
- Create: `supabase/migrations/032_two_stage_popup_reminders.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `popup_reminders.reminded_24h_at` (renamed from `reminded_at`) and `popup_reminders.reminded_1h_at`.

**Scope note:** this task writes the file only. Applying it needs Supabase dashboard access and is in the Operator Runbook. Do not attempt to apply it or connect to any database.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/032_two_stage_popup_reminders.sql`:

```sql
-- Popup reminders go out twice now: about a day ahead, and about an hour
-- ahead. One timestamp cannot record two sends, so the existing flag becomes
-- the 24h one and a second column carries the 1h send.
--
-- RENAME rather than add-and-backfill: every existing non-null reminded_at was
-- a 24h-style send, so the rename preserves the exact history and no row can
-- be re-notified for something it already received.
alter table public.popup_reminders
  rename column reminded_at to reminded_24h_at;

alter table public.popup_reminders
  add column if not exists reminded_1h_at timestamptz;

-- Rows already reminded under the old single-stage scheme have a null 1h flag,
-- so they stay eligible for the 1h notice if their event is still upcoming.
-- That is intended: they were promised a reminder and the 1h one is new.
```

- [ ] **Step 2: Verify it is well-formed and numbered correctly**

```bash
ls supabase/migrations/ | tail -3
test -f supabase/migrations/032_two_stage_popup_reminders.sql && echo "present"
```

Expected: `032_two_stage_popup_reminders.sql` is the highest number, following `031_sweep_schedule.sql`. If 032 is already taken, STOP and report rather than renumbering.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/032_two_stage_popup_reminders.sql
git commit -m "feat(reminders): split popup reminder flag into 24h and 1h"
```

---

### Task 2: `dueReminders` — the pure decision function

**Files:**
- Create: `src/lib/sweep/due-reminders.ts`
- Test: `src/lib/sweep/due-reminders.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:

```ts
export type ReminderStage = '24h' | '1h';

export type ReminderRow = {
  user_id: string;
  listing_id: string;
  created_at: string;          // when they opted in — drives suppression
  reminded_24h_at: string | null;
  reminded_1h_at: string | null;
};

export type ReminderListing = {
  id: string;
  title: string;
  event_start: string;
  event_end: string | null;
  archived: boolean;
};

export type DueReminder = {
  user_id: string;
  listing_id: string;
  stage: ReminderStage;
  suppress: boolean; // true = stamp the flag, send nothing
};

export function dueReminders(
  rows: ReminderRow[],
  listings: Map<string, ReminderListing>,
  now: Date,
): DueReminder[];
```

- [ ] **Step 1: Write the failing test**

Create `src/lib/sweep/due-reminders.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { dueReminders, type ReminderListing, type ReminderRow } from './due-reminders';

const NOW = new Date('2026-08-09T12:00:00.000Z');
const H = 60 * 60 * 1000;

/** A listing starting `hours` from NOW. */
function listingAt(hours: number, over: Partial<ReminderListing> = {}): ReminderListing {
  return {
    id: 'L1',
    title: 'Taco popup',
    event_start: new Date(NOW.getTime() + hours * H).toISOString(),
    event_end: new Date(NOW.getTime() + (hours + 2) * H).toISOString(),
    archived: false,
    ...over,
  };
}

/** Opted in a week ago by default, i.e. well before the 24h window opened. */
function row(over: Partial<ReminderRow> = {}): ReminderRow {
  return {
    user_id: 'U1',
    listing_id: 'L1',
    created_at: new Date(NOW.getTime() - 7 * 24 * H).toISOString(),
    reminded_24h_at: null,
    reminded_1h_at: null,
    ...over,
  };
}

/**
 * Opted in `hoursBeforeStart` before the event begins, for an event that is
 * `eventInHours` from NOW. `hoursBeforeStart` MUST exceed `eventInHours`, or
 * the result is a created_at in the future — which no real row can have.
 */
function optedInAt(hoursBeforeStart: number, eventInHours: number): string {
  if (hoursBeforeStart <= eventInHours) throw new Error('opt-in would be in the future');
  return new Date(NOW.getTime() + (eventInHours - hoursBeforeStart) * H).toISOString();
}

const map = (l: ReminderListing) => new Map([[l.id, l]]);

describe('dueReminders', () => {
  it('sends nothing when the event is beyond the 24h window', () => {
    expect(dueReminders([row()], map(listingAt(30)), NOW)).toEqual([]);
  });

  it('sends the 24h notice inside the (1h, 24h] window', () => {
    expect(dueReminders([row()], map(listingAt(20)), NOW)).toEqual([
      { user_id: 'U1', listing_id: 'L1', stage: '24h', suppress: false },
    ]);
  });

  it('does not resend the 24h notice once stamped', () => {
    const r = row({ reminded_24h_at: '2026-08-08T12:00:00.000Z' });
    expect(dueReminders([r], map(listingAt(20)), NOW)).toEqual([]);
  });

  it('sends the 1h notice inside the (0, 1h] window', () => {
    const r = row({ reminded_24h_at: '2026-08-08T12:00:00.000Z' });
    expect(dueReminders([r], map(listingAt(0.5)), NOW)).toEqual([
      { user_id: 'U1', listing_id: 'L1', stage: '1h', suppress: false },
    ]);
  });

  it('SUPPRESSES an unsent 24h notice once inside the 1h window, and still sends the 1h', () => {
    // Covers both causes: opting in late, and the sweep missing runs.
    const out = dueReminders([row()], map(listingAt(0.5)), NOW);
    expect(out).toContainEqual({ user_id: 'U1', listing_id: 'L1', stage: '24h', suppress: true });
    expect(out).toContainEqual({ user_id: 'U1', listing_id: 'L1', stage: '1h', suppress: false });
    expect(out).toHaveLength(2);
  });

  it('SUPPRESSES the 24h notice when the user opted in inside the 24h window', () => {
    // Event is 20h out; they opted in an hour ago, i.e. 21h before it starts —
    // already inside the 24h window. They just looked at the listing, so a
    // "tomorrow" email now is noise. Only the 1h notice should reach them.
    const r = row({ created_at: optedInAt(21, 20) });
    expect(dueReminders([r], map(listingAt(20)), NOW)).toEqual([
      { user_id: 'U1', listing_id: 'L1', stage: '24h', suppress: true },
    ]);
  });

  it('still sends the 24h notice when they opted in before the window opened', () => {
    const r = row({ created_at: optedInAt(48, 20) });
    expect(dueReminders([r], map(listingAt(20)), NOW)).toEqual([
      { user_id: 'U1', listing_id: 'L1', stage: '24h', suppress: false },
    ]);
  });

  it('sends nothing once both flags are stamped', () => {
    const r = row({ reminded_24h_at: 'x', reminded_1h_at: 'y' });
    expect(dueReminders([r], map(listingAt(0.5)), NOW)).toEqual([]);
  });

  it('sends nothing for an event that already started', () => {
    expect(dueReminders([row()], map(listingAt(-1)), NOW)).toEqual([]);
  });

  it('sends nothing for an archived listing', () => {
    expect(dueReminders([row()], map(listingAt(20, { archived: true })), NOW)).toEqual([]);
  });

  it('sends nothing when the listing is missing entirely', () => {
    expect(dueReminders([row()], new Map(), NOW)).toEqual([]);
  });

  it('treats the window edges as inclusive of the nearer stage', () => {
    // Exactly 1h out belongs to the 1h stage, not the 24h stage.
    const at1h = dueReminders([row({ reminded_24h_at: 'x' })], map(listingAt(1)), NOW);
    expect(at1h).toEqual([{ user_id: 'U1', listing_id: 'L1', stage: '1h', suppress: false }]);
    // Exactly 24h out is still the 24h stage.
    const at24h = dueReminders([row()], map(listingAt(24)), NOW);
    expect(at24h).toEqual([{ user_id: 'U1', listing_id: 'L1', stage: '24h', suppress: false }]);
  });

  it('handles several rows and listings independently', () => {
    const a = listingAt(20, { id: 'LA' });
    const b = listingAt(0.5, { id: 'LB' });
    const listings = new Map([[a.id, a], [b.id, b]]);
    const out = dueReminders(
      [row({ user_id: 'UA', listing_id: 'LA' }), row({ user_id: 'UB', listing_id: 'LB', reminded_24h_at: 'x' })],
      listings,
      NOW,
    );
    expect(out).toEqual([
      { user_id: 'UA', listing_id: 'LA', stage: '24h', suppress: false },
      { user_id: 'UB', listing_id: 'LB', stage: '1h', suppress: false },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/sweep/due-reminders.test.ts`
Expected: FAIL — cannot resolve module `./due-reminders`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/sweep/due-reminders.ts`:

```ts
// Which reminders are due, as a pure function of (rows, listings, now).
// Kept free of Supabase so every timing rule is testable against a fixed clock
// instead of a mocked database — the rules are the whole feature here.

export type ReminderStage = '24h' | '1h';

export type ReminderRow = {
  user_id: string;
  listing_id: string;
  /** When they opted in. Drives suppression of the 24h stage. */
  created_at: string;
  reminded_24h_at: string | null;
  reminded_1h_at: string | null;
};

export type ReminderListing = {
  id: string;
  title: string;
  event_start: string;
  event_end: string | null;
  archived: boolean;
};

export type DueReminder = {
  user_id: string;
  listing_id: string;
  stage: ReminderStage;
  /** true = stamp the flag but send nothing. */
  suppress: boolean;
};

const HOUR = 60 * 60 * 1000;
const LEAD_24H = 24 * HOUR;
const LEAD_1H = 1 * HOUR;

export function dueReminders(
  rows: ReminderRow[],
  listings: Map<string, ReminderListing>,
  now: Date,
): DueReminder[] {
  const out: DueReminder[] = [];

  for (const r of rows) {
    const listing = listings.get(r.listing_id);
    if (!listing || listing.archived) continue;

    const delta = new Date(listing.event_start).getTime() - now.getTime();
    if (!Number.isFinite(delta) || delta <= 0) continue; // started, or an unparseable date

    const inOneHour = delta <= LEAD_1H;
    const inOneDay = delta <= LEAD_24H;

    // The 24h notice is stamped-but-not-sent in two situations. Both produce a
    // "tomorrow!" email that is plainly wrong by the time it would arrive:
    //   1. They opted in when the event was already under 24h away — they had
    //      just looked at the listing, so a day-ahead notice is noise.
    //   2. The event is already inside the 1h window and the 24h flag is still
    //      null, which means the sweep missed runs.
    const optedInInsideWindow =
      new Date(listing.event_start).getTime() - new Date(r.created_at).getTime() <= LEAD_24H;

    // Windows do not overlap: (1h, 24h] and (0, 1h].
    if (inOneHour) {
      if (!r.reminded_24h_at) {
        out.push({ user_id: r.user_id, listing_id: r.listing_id, stage: '24h', suppress: true });
      }
      if (!r.reminded_1h_at) {
        out.push({ user_id: r.user_id, listing_id: r.listing_id, stage: '1h', suppress: false });
      }
    } else if (inOneDay && !r.reminded_24h_at) {
      out.push({
        user_id: r.user_id,
        listing_id: r.listing_id,
        stage: '24h',
        suppress: optedInInsideWindow,
      });
    }
  }

  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/sweep/due-reminders.test.ts`
Expected: PASS — 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sweep/due-reminders.ts src/lib/sweep/due-reminders.test.ts
git commit -m "feat(reminders): pure dueReminders decision function with two windows"
```

---

### Task 3: Stage-aware reminder email

**Files:**
- Modify: `src/lib/notify.ts` — `popupReminderEmail` (currently around line 176)
- Test: `src/lib/notify.test.ts` (append)

**Interfaces:**
- Consumes: nothing. The stage union is written inline as `'24h' | '1h'` rather than imported from `@/lib/sweep/due-reminders` — `notify.ts` is a lower-level module that the sweep depends on, and importing back up the stack inverts that. TypeScript still catches a mismatch at the call site because the two unions are structurally identical.
- Produces: `popupReminderEmail(listingTitle: string, whenLabel: string, stage: '24h' | '1h'): { subject: string; html: string }` — a third required parameter added to the existing two.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/notify.test.ts` (merge `popupReminderEmail` into the existing `./notify` import line rather than adding a second import):

```ts
describe('popupReminderEmail', () => {
  it('frames the 24h notice as upcoming, not imminent', () => {
    const { subject, html } = popupReminderEmail('Taco popup', 'Sat 2-4pm', '24h');
    expect(subject).toMatch(/tomorrow/i);
    expect(subject).not.toMatch(/hour/i);
    expect(html).toContain('Taco popup');
    expect(html).toContain('Sat 2-4pm');
  });

  it('frames the 1h notice as imminent', () => {
    const { subject, html } = popupReminderEmail('Taco popup', 'Sat 2-4pm', '1h');
    expect(subject).toMatch(/hour|soon|starting/i);
    expect(subject).not.toMatch(/tomorrow/i);
    expect(html).toContain('Taco popup');
  });

  it('gives the two stages different subjects', () => {
    const a = popupReminderEmail('Taco popup', 'Sat 2-4pm', '24h').subject;
    const b = popupReminderEmail('Taco popup', 'Sat 2-4pm', '1h').subject;
    expect(a).not.toEqual(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/notify.test.ts`
Expected: FAIL — `popupReminderEmail` takes two arguments, and the 1h subject assertion fails.

- [ ] **Step 3: Write minimal implementation**

No new imports. In `src/lib/notify.ts`, replace `popupReminderEmail` (currently at line 217) entirely with:

```ts
// Buyer opt-in: a popup they asked to be reminded about is coming up. One
// function rather than two near-identical ones, because only the framing
// differs by lead time — "tomorrow" is actively wrong an hour beforehand, and
// "starting soon" is wrong a day out. The stage union is inline rather than
// imported from the sweep: notify is the lower layer and must not depend on it.
export function popupReminderEmail(listingTitle: string, whenLabel: string, stage: '24h' | '1h') {
  const imminent = stage === '1h';
  return {
    subject: imminent
      ? `Starting soon: "${listingTitle}"`
      : `Tomorrow: "${listingTitle}"`,
    html: wrap(
      `<p><strong>${esc(listingTitle)}</strong> ${
        imminent ? 'starts in about an hour' : 'is happening tomorrow'
      } — <strong>${esc(whenLabel)}</strong>.</p>
       <p>You asked us to remind you — see you there.</p>`,
    ),
  };
}
```

This keeps the file's existing `wrap()` shell and `esc()` escaping, matching every neighbouring template.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/notify.test.ts`
Expected: PASS — 12 tests (9 existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/notify.ts src/lib/notify.test.ts
git commit -m "feat(notify): stage-aware popup reminder copy"
```

---

### Task 4: Wire the producer to the two stages

**Files:**
- Modify: `src/lib/sweep/popup-reminders.ts` (rewrite `run`)

**Interfaces:**
- Consumes: `dueReminders`, `ReminderRow`, `ReminderListing`, `DueReminder` from `./due-reminders` (Task 2); `popupReminderEmail(title, when, stage)` from `@/lib/notify` (Task 3).
- Produces: unchanged — `popupRemindersProducer: Producer` named `popup_reminders`, count key `reminders`.

**Two changes beyond the split, both required by it:**
1. Select `archived` on the listings query — `dueReminders` needs it and the current query omits it.
2. Fetch profiles in ONE batched query instead of one per row. The current code queries `profiles` inside the loop; with two stages the row count roughly doubles, and an N+1 inside an hourly job over a growing table is the wrong direction.

- [ ] **Step 1: Rewrite `run`**

Replace the body of `run` in `src/lib/sweep/popup-reminders.ts`. Keep the file's existing header comment about the `'popup_reminder'` pref fix — that history stays relevant — and add why the split exists:

```ts
import { admin } from '@/lib/supabase/admin';
import { formatEventWindow } from '@/lib/validation';
import { popupReminderEmail, sendEmail, verifiedEmailFor, wantsEmail } from '@/lib/notify';
import { dueReminders, type ReminderListing, type ReminderRow } from './due-reminders';
import type { Producer } from './index';

async function run(): Promise<Record<string, number>> {
  const now = new Date();
  const nowIso = now.toISOString();
  const soonIso = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  // Any row with an unsent stage is a candidate; dueReminders decides which.
  const { data: pending, error: pendingError } = await admin
    .from('popup_reminders')
    .select('user_id, listing_id, created_at, reminded_24h_at, reminded_1h_at')
    .or('reminded_24h_at.is.null,reminded_1h_at.is.null');
  if (pendingError) throw new Error(pendingError.message);

  const rows = (pending ?? []) as ReminderRow[];
  if (rows.length === 0) return { reminders: 0 };

  const listingIds = Array.from(new Set(rows.map((r) => r.listing_id)));
  const { data: listingRows, error: listingsError } = await admin
    .from('listings')
    .select('id, title, event_start, event_end, archived')
    .in('id', listingIds)
    .gte('event_start', nowIso)
    .lte('event_start', soonIso);
  if (listingsError) throw new Error(listingsError.message);

  const listings = new Map<string, ReminderListing>(
    (listingRows ?? []).map((l) => [l.id as string, l as ReminderListing]),
  );

  const due = dueReminders(rows, listings, now);
  if (due.length === 0) return { reminders: 0 };

  // One query for every profile we might need, rather than one per row inside
  // the loop. Two stages roughly doubles the row count, and this runs hourly
  // against a table that only grows.
  const userIds = Array.from(new Set(due.map((d) => d.user_id)));
  const { data: profileRows } = await admin
    .from('profiles')
    .select('id, notify_prefs')
    .in('id', userIds);
  const prefsById = new Map(
    (profileRows ?? []).map((p) => [p.id as string, (p as { notify_prefs: unknown }).notify_prefs]),
  );

  let sent = 0;
  for (const d of due) {
    const listing = listings.get(d.listing_id)!;
    const column = d.stage === '1h' ? 'reminded_1h_at' : 'reminded_24h_at';

    if (!d.suppress && wantsEmail(prefsById.get(d.user_id), 'popup_reminder')) {
      const to = await verifiedEmailFor(d.user_id);
      if (to) {
        const when = formatEventWindow(listing.event_start, listing.event_end);
        const { subject, html } = popupReminderEmail(listing.title, when, d.stage);
        await sendEmail(to, subject, html);
        sent++;
      }
    }

    // Stamp regardless of outcome — suppressed, opted out, or no verified
    // address — so a dead row isn't reconsidered every hour.
    await admin
      .from('popup_reminders')
      .update({ [column]: new Date().toISOString() })
      .eq('user_id', d.user_id)
      .eq('listing_id', d.listing_id);
  }

  return { reminders: sent };
}

export const popupRemindersProducer: Producer = { name: 'popup_reminders', run };
```

- [ ] **Step 2: Verify types and the whole suite**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: tsc exits 0; all tests pass — 14 from the previous phase, 13 from Task 2, 3 from Task 3, plus the pre-existing `validation.test.ts`.

- [ ] **Step 3: Verify the route still answers**

With `npm run dev` running (check `lsof -nP -iTCP:3000 -sTCP:LISTEN` before starting another):

```bash
curl -s -o /dev/null -w "no auth -> %{http_code}\n" http://localhost:3000/api/cron/sweep
```

Expected: `401`. An authenticated call cannot be made here — reading `CRON_SECRET` is blocked by a permission rule on `.env.*` paths. Do not attempt to work around that rule; the Operator Runbook verifies the authenticated path against the real project.

- [ ] **Step 4: Commit**

```bash
git add src/lib/sweep/popup-reminders.ts
git commit -m "feat(reminders): send at 24h and 1h, batch profile lookups"
```

---

## Verification

- `npx vitest run` — all pass, 16 new across Tasks 2 and 3
- `npx tsc --noEmit` — exits 0
- `GET /api/cron/sweep` without auth → `401`
- No client file changed: `git diff --name-only` includes neither `src/app/api/popup-reminders/route.ts` nor `mobile/src/lib/listings.ts`

## Operator Runbook (human, after merge)

Migration 032 renames a column the running producer reads, so apply it and deploy the code close together. In the gap the producer throws, `runSweep` catches it, other producers keep running, and the error surfaces in the route's `errors` array. Nothing is lost — the flags stay null and the next hourly run delivers whatever was due.

**1.** Merge and push so Vercel deploys.

**2.** Apply `supabase/migrations/032_two_stage_popup_reminders.sql` in the Supabase SQL editor, then confirm:

```sql
select column_name from information_schema.columns
where table_name = 'popup_reminders' order by column_name;
```

Expected: `created_at, listing_id, reminded_1h_at, reminded_24h_at, user_id`. No `reminded_at`.

**3.** Fire the sweep by hand rather than waiting an hour:

```sql
select net.http_get(
  url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url')
         || '/api/cron/sweep',
  headers := jsonb_build_object(
    'Authorization',
    'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
  ),
  timeout_milliseconds := 30000
);
```

Note the returned request id, then:

```sql
select status_code, content, error_msg from net._http_response where id = <that id>;
```

Expected: `200` with `{"ok":true,"counts":{"reminders":N},"errors":[]}`. A non-empty `errors` array naming `popup_reminders` means the migration has not been applied yet.

## Out of Scope

- SMS or push delivery for reminders — this stays email-only, matching today's behavior. SMS is spec Step 3.
- Re-notifying when a seller moves an event's start time. Stamped flags stay stamped.
- Any change to how users opt in. Both clients keep inserting `(user_id, listing_id)`.
- Configurable lead times. Two fixed windows; a preference for them is not requested.
