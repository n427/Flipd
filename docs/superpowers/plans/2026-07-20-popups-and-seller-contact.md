# Popups & Seller Contact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make popup (`event`-category) listings capture a date/time window instead of a price and let buyers opt into a day-before reminder; make the seller's contact method a per-listing multi-select chosen with chips in the posting form.

**Architecture:** Two independent feature slices sharing a codebase. Part 1 adds category-aware branching to the posting form (first of its kind), two `listings` timestamp columns, a `popup_reminders` table mirroring `saves`, and a secret-guarded cron route that emails opted-in buyers. Part 2 replaces read-only contact text with multi-select chips whose selection is stored per-listing in the already-`text[]` `listings.contact` column; the reveal-approval path already shares all methods present in `listings.contact`, so it needs no change. Pure, dependency-free logic lands in `src/lib/validation.ts` and is unit-tested alongside the existing `parseCoords`/`resolveSharedContact` tests.

**Tech Stack:** Next.js (App Router, route handlers), React (client components), TypeScript, Supabase (Postgres + storage, `admin` service client), Vitest (`*.test.ts`), Resend (email via `notify.ts`).

## Global Constraints

- Brand: the app is **Flipd**, never "Tassel" in UI. No emojis in UI — use SVG `Icon` components. (Copy verbatim from brand memory.)
- UX restraint: terse labels, one validation surface, no stacked "delight" patterns, no wizards.
- "Popups" is a **display label only**; the category **id is `event`**. All logic/DB/conditionals use `event`.
- A listing is a popup iff its `categories` array **contains `event`** ("event wins": no price, event window required).
- `src/lib/validation.ts` must stay **dependency-free** (no imports) — it is shared by API routes and the client and must stay trivially unit-testable.
- Contact values live on the profile (`contact_instagram`/`contact_phone`/`contact_email`); only the *selection* is per-listing. `profiles.contact_method` is left in place but no longer read or written.
- Migrations are additive/non-destructive; new SQL files are numbered after `016`.
- Tests: run with `npx vitest run <file>`. Follow the existing table-style tests in `src/lib/validation.test.ts`.

---

## File Structure

**Part 1 — Popups**
- `supabase/migrations/017_popup_events.sql` (create) — `listings.event_start`/`event_end`; `popup_reminders` table + RLS.
- `src/lib/validation.ts` (modify) — add `parseEventWindow`, `formatEventWindow`.
- `src/lib/validation.test.ts` (modify) — tests for the two helpers.
- `src/lib/types.ts` (modify) — `Listing.eventStart`/`eventEnd`; keep `eventPill`.
- `src/lib/store.ts` (modify) — map event columns; `isReminded`/`toggleReminder`/`popupReminderIds`; set `eventPill`.
- `src/components/WebApp.tsx` (modify) — form: swap price↔When on `isPopup`; detail: event window in `priceLine`; buyer "Remind me" button.
- `src/app/api/listings/route.ts` (modify) — parse/store event window; force price 0 for popups.
- `src/app/api/popup-reminders/route.ts` (create) — GET/POST/DELETE, mirrors `saves`.
- `src/lib/notify.ts` (modify) — add `popupReminderEmail`.
- `src/app/api/cron/popup-reminders/route.ts` (create) — secret-guarded sweep.

**Part 2 — Contact chips**
- `src/components/WebApp.tsx` (modify) — replace read-only contact text with chips; add `contactMethods` state + gate; append to FormData.
- `src/app/api/listings/route.ts` (modify) — build `contact` from submitted methods ∩ profile values.
- `src/app/(app)/profile/edit/page.tsx` (modify) — stop sending `contact_method`; drop `primaryMethod` import.
- `src/lib/validation.ts` (modify) — remove `primaryMethod` (once unused).
- `src/lib/validation.test.ts` (modify) — drop `primaryMethod` tests.
- `src/lib/store.ts` (modify) — `contactMethods: ContactMethod[]` from `row.contact`.
- `src/lib/types.ts` (modify) — `Listing.contactMethods`.

---

# PART 1 — Popups: event window + Remind me

### Task 1: Migration — event columns + popup_reminders table

**Files:**
- Create: `supabase/migrations/017_popup_events.sql`

**Interfaces:**
- Produces: `listings.event_start timestamptz`, `listings.event_end timestamptz`; table `popup_reminders(user_id, listing_id, reminded_at, created_at)` PK `(user_id, listing_id)`.

- [ ] **Step 1: Write the migration**

```sql
-- Popup (event-category) listings: an event date/time window, plus buyers'
-- opt-in day-before reminders. Mirrors the saves table shape (003).
alter table public.listings
  add column if not exists event_start timestamptz,
  add column if not exists event_end   timestamptz;

create table if not exists public.popup_reminders (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  listing_id  uuid not null references public.listings (id) on delete cascade,
  reminded_at timestamptz,
  created_at  timestamptz not null default now(),
  primary key (user_id, listing_id)
);

alter table public.popup_reminders enable row level security;

create policy "popup_reminders self select"
  on public.popup_reminders for select
  using (auth.uid() = user_id);

create policy "popup_reminders self insert"
  on public.popup_reminders for insert
  with check (auth.uid() = user_id);

create policy "popup_reminders self delete"
  on public.popup_reminders for delete
  using (auth.uid() = user_id);
```

- [ ] **Step 2: Verify SQL is well-formed**

Run: `grep -c "create policy" supabase/migrations/017_popup_events.sql`
Expected: `3`

(Migration application is manual against Supabase, per repo convention — the file is the deliverable. Note in the commit that `017` must be applied before the feature works.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/017_popup_events.sql
git commit -m "feat(db): popup event window + popup_reminders table (017)"
```

---

### Task 2: `parseEventWindow` + `formatEventWindow` helpers (TDD)

**Files:**
- Modify: `src/lib/validation.ts`
- Test: `src/lib/validation.test.ts`

**Interfaces:**
- Produces:
  - `parseEventWindow(date: string, start: string, end: string): { start: string; end: string } | null` — combines a `YYYY-MM-DD` date with two `HH:MM` times into ISO strings; returns `null` if any part is blank/unparseable or if `end` is not strictly after `start`.
  - `formatEventWindow(startIso: string, endIso: string): string` — e.g. `"Fri, Jul 24 · 7:00–11:00 PM"`. Same-day collapses to one date + a time range.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/validation.test.ts` (after the `parseCoords` describe block):

```ts
describe('parseEventWindow', () => {
  it('combines date + start/end into ISO strings', () => {
    const w = parseEventWindow('2026-07-24', '19:00', '23:00');
    expect(w).not.toBeNull();
    expect(new Date(w!.start).getHours()).toBe(19);
    expect(new Date(w!.end).getHours()).toBe(23);
  });
  it('returns null when a part is blank', () => {
    expect(parseEventWindow('', '19:00', '23:00')).toBeNull();
    expect(parseEventWindow('2026-07-24', '', '23:00')).toBeNull();
    expect(parseEventWindow('2026-07-24', '19:00', '')).toBeNull();
  });
  it('returns null when end is not after start', () => {
    expect(parseEventWindow('2026-07-24', '23:00', '19:00')).toBeNull();
    expect(parseEventWindow('2026-07-24', '19:00', '19:00')).toBeNull();
  });
});

describe('formatEventWindow', () => {
  it('shows one date and a time range for a same-day window', () => {
    const w = parseEventWindow('2026-07-24', '19:00', '23:00')!;
    const label = formatEventWindow(w.start, w.end);
    expect(label).toContain('Jul 24');
    expect(label).toMatch(/7.*11/); // 7 … 11
  });
});
```

Add `parseEventWindow, formatEventWindow` to the import on line 2 of the test file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/validation.test.ts`
Expected: FAIL — `parseEventWindow is not a function` / `formatEventWindow is not a function`.

- [ ] **Step 3: Implement the helpers**

Append to `src/lib/validation.ts` (keep it import-free):

```ts
// Combine a YYYY-MM-DD date with HH:MM start/end into ISO strings. Same-day
// only: end must be strictly after start, else null (never a partial window).
export function parseEventWindow(
  date: string,
  start: string,
  end: string,
): { start: string; end: string } | null {
  if (!date?.trim() || !start?.trim() || !end?.trim()) return null;
  const s = new Date(`${date}T${start}`);
  const e = new Date(`${date}T${end}`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  if (e.getTime() <= s.getTime()) return null;
  return { start: s.toISOString(), end: e.toISOString() };
}

// Human label for an event window: "Fri, Jul 24 · 7:00 – 11:00 PM".
export function formatEventWindow(startIso: string, endIso: string): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return '';
  const day = s.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const t = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${t(s)} – ${t(e)}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/validation.test.ts`
Expected: PASS (all, including pre-existing).

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation.ts src/lib/validation.test.ts
git commit -m "feat(validation): parseEventWindow + formatEventWindow helpers"
```

---

### Task 3: Types + store mapping for event window

**Files:**
- Modify: `src/lib/types.ts:57` (near `eventPill`)
- Modify: `src/lib/store.ts` (the `mapDbListing` return, around lines 97-112)

**Interfaces:**
- Consumes: `formatEventWindow` (Task 2).
- Produces: `Listing.eventStart?: string | null`, `Listing.eventEnd?: string | null`; `mapDbListing` sets `eventStart`/`eventEnd` and, for event listings with a window, sets `eventPill` to `formatEventWindow(...)`.

- [ ] **Step 1: Add fields to the `Listing` type**

In `src/lib/types.ts`, add after line 57 (`eventPill?: string;`):

```ts
  eventStart?: string | null;
  eventEnd?: string | null;
```

- [ ] **Step 2: Map the columns in the store**

In `src/lib/store.ts`, ensure `formatEventWindow` is imported from `./validation` (add to the existing validation import). In `mapDbListing`, add to the returned object (alongside `eventPill` handling — there is currently none, so add both):

```ts
    eventStart: row.event_start ?? null,
    eventEnd: row.event_end ?? null,
    eventPill:
      row.event_start && row.event_end
        ? formatEventWindow(row.event_start, row.event_end)
        : undefined,
```

Also extend the `DbListing` DTO type (near `store.ts:32`) with `event_start?: string | null; event_end?: string | null;`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors from these files.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts src/lib/store.ts
git commit -m "feat: map listing event window; card eventPill from window"
```

---

### Task 4: Posting form — swap price ↔ When for popups

**Files:**
- Modify: `src/components/WebApp.tsx` — `WebCreate` (state ~923-926, `missing` ~1033-1041, `buildFormData` ~1043-1060, price block 1289-1308).

**Interfaces:**
- Consumes: `categories` state (existing).
- Produces: FormData carries `event_start`/`event_end` (ISO) and omits `price` when the listing is a popup; otherwise unchanged.

- [ ] **Step 1: Add derived flag + event state**

After the `categories` state (line 923) add:

```tsx
  const isPopup = categories.includes('event');
  const [eventDate, setEventDate] = React.useState(initial?.eventStart ? initial.eventStart.slice(0, 10) : '');
  const [eventStartTime, setEventStartTime] = React.useState(
    initial?.eventStart ? new Date(initial.eventStart).toTimeString().slice(0, 5) : '',
  );
  const [eventEndTime, setEventEndTime] = React.useState(
    initial?.eventEnd ? new Date(initial.eventEnd).toTimeString().slice(0, 5) : '',
  );
```

- [ ] **Step 2: Make the `missing` validation category-aware**

Replace the `!price.trim() && 'a price'` entry (line 1038) with a conditional set:

```tsx
    !isPopup && !price.trim() && 'a price',
    isPopup && !eventDate && 'an event date',
    isPopup && !eventStartTime && 'a start time',
    isPopup && !eventEndTime && 'an end time',
    isPopup && eventDate && eventStartTime && eventEndTime &&
      !parseEventWindow(eventDate, eventStartTime, eventEndTime) && 'a valid time range (end after start)',
```

Import `parseEventWindow` (and `formatEventWindow` if used for preview) from `@/lib/validation` at the top of `WebApp.tsx` (there is an existing validation import to extend).

- [ ] **Step 3: Conditionally append to FormData**

In `buildFormData` replace the unconditional `fd.append('price', price)` / `fd.append('negotiable', ...)` (lines 1049-1050) with:

```tsx
    if (isPopup) {
      const win = parseEventWindow(eventDate, eventStartTime, eventEndTime);
      if (win) { fd.append('event_start', win.start); fd.append('event_end', win.end); }
    } else {
      fd.append('price', price);
      fd.append('negotiable', String(neg));
    }
```

- [ ] **Step 4: Swap the price block UI**

Wrap the price/negotiable block (1289-1308) so it renders only when `!isPopup`, and add a "When" group for `isPopup`:

```tsx
          {isPopup ? (
            <div style={{ marginBottom: 22 }}>
              <label className="field-label">When<span style={{ color: 'var(--accent)' }}> *</span></label>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 12 }}>
                <input type="date" className="field" value={eventDate} onChange={(e) => setEventDate(e.target.value)} aria-label="Event date" />
                <input type="time" className="field" value={eventStartTime} onChange={(e) => setEventStartTime(e.target.value)} aria-label="Start time" />
                <input type="time" className="field" value={eventEndTime} onChange={(e) => setEventEndTime(e.target.value)} aria-label="End time" />
              </div>
            </div>
          ) : (
            /* existing price + negotiable block, unchanged */
          )}
```

Also update `previewListing` (line 1081+): when `isPopup`, set `eventStart`/`eventEnd` from the parsed window and `priceLabel` to `''` (or leave the event pill to carry it); otherwise unchanged.

- [ ] **Step 5: Typecheck + smoke the form**

Run: `npx tsc --noEmit`
Expected: no new errors.
Then manually (or via /run): select the Popups chip → price disappears, When appears and is required; deselect → price returns.

- [ ] **Step 6: Commit**

```bash
git add src/components/WebApp.tsx
git commit -m "feat(create): popup listings capture event window instead of price"
```

---

### Task 5: Listings API — store event window, force price 0 for popups

**Files:**
- Modify: `src/app/api/listings/route.ts` (POST, lines 59-120)

**Interfaces:**
- Consumes: `parseEventWindow` (Task 2), FormData `event_start`/`event_end`.
- Produces: inserted row has `event_start`/`event_end` set and `price = 0` for popups; 400 when a popup lacks a valid window.

- [ ] **Step 1: Parse + validate the window**

Add near the other field reads (after line 68), and import `parseEventWindow` on line 4:

```ts
  const isPopup = categories.includes('event');
  const eventStart = (formData.get('event_start') as string | null) || null;
  const eventEnd = (formData.get('event_end') as string | null) || null;
  if (isPopup && !parseEventWindow(
    eventStart ? eventStart.slice(0, 10) : '',
    eventStart ? new Date(eventStart).toTimeString().slice(0, 5) : '',
    eventEnd ? new Date(eventEnd).toTimeString().slice(0, 5) : '',
  )) {
    return NextResponse.json({ error: 'event date/time required' }, { status: 400 });
  }
```

- [ ] **Step 2: Write the columns**

In the `.insert({...})` (line 104), set:

```ts
      price: isPopup ? 0 : (isNaN(price) ? 0 : price),
      event_start: isPopup ? eventStart : null,
      event_end: isPopup ? eventEnd : null,
```

(Replace the existing `price:` line; add the two event lines.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/listings/route.ts
git commit -m "feat(api): store popup event window; price 0 for popups"
```

---

### Task 6: Detail page — show event window where price renders

**Files:**
- Modify: `src/components/WebApp.tsx` — `priceLine` (534-539).

**Interfaces:**
- Consumes: `listing.eventStart`/`eventEnd`, `formatEventWindow` (Task 2).
- Produces: for event listings, the detail renders the event window in place of `priceLabel`.

- [ ] **Step 1: Branch `priceLine` on event window**

Replace the body of `priceLine` (534-539) with:

```tsx
  const priceLine = (size: number) => (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
      {listing.eventStart && listing.eventEnd ? (
        <span style={{ fontWeight: 700, fontSize: size * 0.7, letterSpacing: '-0.01em', color: 'var(--ink)' }}>
          {formatEventWindow(listing.eventStart, listing.eventEnd)}
        </span>
      ) : (
        <span style={{ fontWeight: 700, fontSize: size, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{listing.priceLabel}</span>
      )}
      {/* keep any existing negotiable/"open to offers" suffix for non-event listings */}
    </div>
  );
```

(Preserve whatever the original 534-539 rendered after the price span for the non-event branch.)

- [ ] **Step 2: Typecheck + eyeball**

Run: `npx tsc --noEmit`
Then via /run: open a popup listing → detail shows the date/time, not a price.

- [ ] **Step 3: Commit**

```bash
git add src/components/WebApp.tsx
git commit -m "feat(detail): show event window instead of price for popups"
```

---

### Task 7: popup-reminders API route (mirrors saves)

**Files:**
- Create: `src/app/api/popup-reminders/route.ts`

**Interfaces:**
- Produces: `GET → { ids: string[] }`; `POST { listing_id }` upserts `(user_id, listing_id)`; `DELETE { listing_id }` removes it. Same shape/pattern as `/api/saves`.

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { admin as supabase } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data, error } = await supabase
    .from('popup_reminders')
    .select('listing_id')
    .eq('user_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ids: data.map((r) => r.listing_id) });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { listing_id } = await req.json().catch(() => ({}));
  if (!listing_id) return NextResponse.json({ error: 'listing_id required' }, { status: 400 });
  const { error } = await supabase
    .from('popup_reminders')
    .upsert({ user_id: user.id, listing_id }, { onConflict: 'user_id,listing_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { listing_id } = await req.json().catch(() => ({}));
  if (!listing_id) return NextResponse.json({ error: 'listing_id required' }, { status: 400 });
  const { error } = await supabase
    .from('popup_reminders')
    .delete()
    .eq('user_id', user.id)
    .eq('listing_id', listing_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/popup-reminders/route.ts
git commit -m "feat(api): popup-reminders route (opt-in day-before reminder)"
```

---

### Task 8: Store — reminder set + toggle; detail "Remind me" button

**Files:**
- Modify: `src/lib/store.ts` — mirror `savedIds`/`isSaved`/`toggleSave` (155-157, 190, 229-264) plus the initial fetch (229-232).
- Modify: `src/components/WebApp.tsx` — add a "Remind me" button on the popup detail (near the Save button, 605-606).

**Interfaces:**
- Consumes: `/api/popup-reminders` (Task 7).
- Produces: `store.isReminded(id)`, `store.toggleReminder(id)`, `store.popupReminderIds: Set<string>`.

- [ ] **Step 1: Add store state + methods**

In `useFlipdStore`: add `const [popupReminderIds, setPopupReminderIds] = React.useState<Set<string>>(() => new Set());`. In the mount effect, add a fetch mirroring the `/api/saves` one:

```ts
    fetch('/api/popup-reminders')
      .then((r) => r.json())
      .then(({ ids }) => { if (alive && Array.isArray(ids)) setPopupReminderIds(new Set(ids)); })
      .catch(() => {});
```

Add `isReminded`/`toggleReminder` mirroring `isSaved`/`toggleSave` (optimistic set update + POST/DELETE to `/api/popup-reminders`, revert on failure). Add all three to the `FlipdStore` interface (near 155-157) and to the returned object.

- [ ] **Step 2: Add the button on the popup detail**

Where the Save button renders on the detail (`WebApp.tsx:605-606`), add — only when `listing.eventStart`:

```tsx
{listing.eventStart && (
  <Button
    kind={store.isReminded(listing.id) ? 'primary' : 'secondary'}
    icon="bell"
    onClick={() => store.toggleReminder(listing.id)}
  >
    {store.isReminded(listing.id) ? 'Reminder on' : 'Remind me'}
  </Button>
)}
```

(`bell` and `clock` both exist in `src/components/Icon.tsx` — use `bell`. No emoji.)

- [ ] **Step 3: Typecheck + click-through**

Run: `npx tsc --noEmit`
Then via /run: on a popup detail, "Remind me" toggles to "Reminder on" and persists across reload.

- [ ] **Step 4: Commit**

```bash
git add src/lib/store.ts src/components/WebApp.tsx
git commit -m "feat: buyer opt-in Remind me on popup listings"
```

---

### Task 9: notify — popupReminderEmail

**Files:**
- Modify: `src/lib/notify.ts`

**Interfaces:**
- Produces: `popupReminderEmail(listingTitle: string, whenLabel: string): { subject: string; html: string }`.

- [ ] **Step 1: Add the email builder**

Append to `notify.ts` (reuse `wrap`/`esc`):

```ts
// Buyer opt-in: a popup they asked to be reminded about is tomorrow.
export function popupReminderEmail(listingTitle: string, whenLabel: string) {
  return {
    subject: `Reminder: "${listingTitle}" is coming up`,
    html: wrap(
      `<p><strong>${esc(listingTitle)}</strong> is happening <strong>${esc(whenLabel)}</strong>.</p>
       <p>You asked us to remind you — see you there.</p>`,
    ),
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/notify.ts
git commit -m "feat(notify): popupReminderEmail template"
```

---

### Task 10: Cron sweep route — email opted-in buyers ~24h before

**Files:**
- Create: `src/app/api/cron/popup-reminders/route.ts`

**Interfaces:**
- Consumes: `popup_reminders`, `listings.event_start`, `notify.ts` (`popupReminderEmail`, `sendEmail`, `verifiedEmailFor`, `wantsEmail`), `formatEventWindow`.
- Produces: `GET` (bearer `CRON_SECRET`) → emails each opted-in buyer once for popups starting within the next 24h, sets `reminded_at`.

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { formatEventWindow } from '@/lib/validation';
import { popupReminderEmail, sendEmail, verifiedEmailFor, wantsEmail } from '@/lib/notify';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const now = Date.now();
  const soon = new Date(now + 24 * 60 * 60 * 1000).toISOString();
  const nowIso = new Date(now).toISOString();

  // Pending reminders for popups starting within the next 24h.
  const { data: rows, error } = await admin
    .from('popup_reminders')
    .select('user_id, listing_id, reminded_at, listing:listings!inner(id, title, event_start, event_end)')
    .is('reminded_at', null)
    .gte('listing.event_start', nowIso)
    .lte('listing.event_start', soon);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  for (const r of (rows ?? []) as Array<{ user_id: string; listing_id: string; listing: { title: string; event_start: string; event_end: string } }>) {
    const prof = await admin.from('profiles').select('notify_prefs').eq('id', r.user_id).single();
    if (!wantsEmail(prof.data?.notify_prefs, 'reminder')) continue;
    const to = await verifiedEmailFor(r.user_id);
    if (to) {
      const when = formatEventWindow(r.listing.event_start, r.listing.event_end);
      const { subject, html } = popupReminderEmail(r.listing.title, when);
      await sendEmail(to, subject, html);
      sent++;
    }
    await admin.from('popup_reminders')
      .update({ reminded_at: new Date().toISOString() })
      .eq('user_id', r.user_id).eq('listing_id', r.listing_id);
  }

  return NextResponse.json({ ok: true, sent });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Verify guard rejects without secret**

Run: `npx vitest run` is N/A (route, not unit-tested). Instead confirm by reading: a request with no/invalid `Authorization` returns 401. (Document that an external scheduler must call this hourly with `Authorization: Bearer $CRON_SECRET`, and `CRON_SECRET` must be set in the environment.)

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/popup-reminders/route.ts
git commit -m "feat(cron): popup reminder sweep (secret-guarded, day-before)"
```

---

# PART 2 — Per-listing contact chips

### Task 11: Posting form — replace read-only contact text with chips

**Files:**
- Modify: `src/components/WebApp.tsx` — contact block (1315-1322), state (~923+), `missing` (1040), `buildFormData` (1043-1060).

**Interfaces:**
- Consumes: `store.me?.contact_instagram/contact_phone/contact_email`, `CONTACT_METHOD_ICONS`/`CONTACT_METHOD_LABELS` (already used in `RevealModal`).
- Produces: FormData carries `contact_methods` (JSON array of the selected method ids).

- [ ] **Step 1: Compute available methods + state**

Near the other `WebCreate` state (after line 926), add:

```tsx
  const availableMethods = (['instagram', 'phone', 'email'] as const)
    .filter((k) => store.me?.[`contact_${k}` as const]);
  const [contactMethods, setContactMethods] = React.useState<string[]>(
    () => initial?.contactMethods && initial.contactMethods.length
      ? initial.contactMethods.filter((m) => availableMethods.includes(m as typeof availableMethods[number]))
      : [...availableMethods],
  );
```

- [ ] **Step 2: Replace the read-only block with chips**

Replace the contact block (1315-1322) with:

```tsx
          <label className="field-label">How buyers reach you</label>
          {availableMethods.length === 0 ? (
            <div style={{ fontFamily: 'var(--sans)', fontSize: 13.5, color: 'var(--accent)' }}>
              Add a contact method in your profile first.
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {availableMethods.map((k) => {
                const on = contactMethods.includes(k);
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setContactMethods((prev) =>
                      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k])}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      border: `1.5px solid ${on ? 'var(--ink)' : 'var(--rule)'}`,
                      background: on ? 'var(--ink)' : '#fff',
                      color: on ? '#fff' : 'var(--ink)',
                      borderRadius: 999, padding: '8px 14px', cursor: 'pointer',
                      fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 13.5,
                    }}
                  >
                    <Icon name={CONTACT_METHOD_ICONS[k]} size={15} color={on ? '#fff' : 'var(--muted)'} />
                    {CONTACT_METHOD_LABELS[k]}
                  </button>
                );
              })}
            </div>
          )}
```

- [ ] **Step 3: Update the publish gate**

Replace the contact entry in `missing` (line 1040) with:

```tsx
    availableMethods.length === 0 && 'a contact method (set it in your profile)',
    availableMethods.length > 0 && contactMethods.length === 0 && 'at least one contact method',
```

- [ ] **Step 4: Append to FormData**

In `buildFormData`, add:

```tsx
    fd.append('contact_methods', JSON.stringify(contactMethods));
```

- [ ] **Step 5: Typecheck + click-through**

Run: `npx tsc --noEmit`
Then via /run: a profile with 2 filled methods shows 2 chips both selected; deselecting all blocks publish; unfilled methods show no chip.

- [ ] **Step 6: Commit**

```bash
git add src/components/WebApp.tsx
git commit -m "feat(create): per-listing contact method chips"
```

---

### Task 12: Listings API — build contact from submitted chips

**Files:**
- Modify: `src/app/api/listings/route.ts` (contact derivation, 69-75)

**Interfaces:**
- Consumes: FormData `contact_methods`; profile `contact_instagram/phone/email`.
- Produces: `listings.contact` = submitted methods ∩ methods with a stored value; falls back to all-filled when nothing submitted.

- [ ] **Step 1: Rework the contact derivation**

Replace lines 69-75 with:

```ts
  // Contact selection is per-listing (chips), intersected with the methods the
  // profile actually has a value for. Falls back to all-filled if none sent.
  const { data: sellerProfile } = await supabase
    .from('profiles')
    .select('contact_instagram, contact_phone, contact_email')
    .eq('id', user.id)
    .single();
  const filled = (['instagram', 'phone', 'email'] as const).filter((k) => {
    const col = k === 'instagram' ? 'contact_instagram' : k === 'phone' ? 'contact_phone' : 'contact_email';
    return sellerProfile?.[col as keyof typeof sellerProfile];
  });
  const submitted = JSON.parse((formData.get('contact_methods') as string) || '[]') as string[];
  const chosen = submitted.filter((m) => filled.includes(m as typeof filled[number]));
  const contact = chosen.length ? chosen : filled;
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors. (`contact` is used unchanged in the insert at line 117.)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/listings/route.ts
git commit -m "feat(api): build listing contact from submitted chips ∩ profile values"
```

---

### Task 13: Client model — `contactMethods` from `listings.contact`

**Files:**
- Modify: `src/lib/types.ts:59`
- Modify: `src/lib/store.ts:112`

**Interfaces:**
- Produces: `Listing.contactMethods: ContactMethod[]` (replaces singular `contactMethod`); populated from `row.contact`.

- [ ] **Step 1: Change the type**

In `src/lib/types.ts`, replace line 59 (`contactMethod?: ContactMethod;`) with:

```ts
  contactMethods?: ContactMethod[];
```

- [ ] **Step 2: Map the full array in the store**

In `src/lib/store.ts`, replace line 112 with:

```ts
    contactMethods: (row.contact ?? []) as Listing['contactMethods'],
```

- [ ] **Step 3: Fix any remaining `contactMethod` references**

Run: `grep -rn "contactMethod\b" src`
For each hit (outside the changed lines), update to render `contactMethods` (join all selected labels). Then typecheck.

Run: `npx tsc --noEmit`
Expected: no errors referencing `contactMethod`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts src/lib/store.ts src/components/WebApp.tsx
git commit -m "feat: listing carries multiple contact methods (contactMethods)"
```

---

### Task 14: Profile edit — stop writing `contact_method`; remove `primaryMethod`

**Files:**
- Modify: `src/app/(app)/profile/edit/page.tsx` (import line 6, PATCH body line 78)
- Modify: `src/lib/validation.ts` (remove `primaryMethod`, lines 44-47)
- Modify: `src/lib/validation.test.ts` (remove `primaryMethod` tests + import)

**Interfaces:**
- Consumes: nothing new.
- Produces: profile PATCH no longer sends `contact_method`; `primaryMethod` deleted.

- [ ] **Step 1: Drop `contact_method` from the PATCH**

In `profile/edit/page.tsx`, remove the `contact_method: primaryMethod(...)` line (78) from the PATCH body, and remove `import { primaryMethod } from '@/lib/validation';` (line 6).

- [ ] **Step 2: Remove `primaryMethod` and its tests**

Delete `primaryMethod` from `src/lib/validation.ts` (44-47). In `src/lib/validation.test.ts`, remove the `primaryMethod` import token (line 2) and its `describe`/tests.

- [ ] **Step 3: Confirm nothing else uses it**

Run: `grep -rn "primaryMethod\|contact_method" src`
Expected: no references in `src/app` or `src/components` (the DB column may remain referenced only by the now-removed code; the `Profile.contact_method` type field may stay). If `store.me?.contact_method` is still read anywhere for the posting form, it has been replaced by chips in Task 11 — remove any leftover read.

- [ ] **Step 4: Run the test suite**

Run: `npx vitest run src/lib/validation.test.ts`
Expected: PASS, no `primaryMethod` references.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/profile/edit/page.tsx" src/lib/validation.ts src/lib/validation.test.ts
git commit -m "refactor: stop writing legacy contact_method; remove primaryMethod"
```

---

## Final verification

- [ ] **Full test suite:** `npx vitest run` → all pass.
- [ ] **Typecheck:** `npx tsc --noEmit` → clean.
- [ ] **Lint/build:** `npm run build` → succeeds.
- [ ] **Manual (via /run or /verify):**
  - Post a Popups listing: price hidden, When required, saved with a window; feed card shows the date pill, detail shows the window, "Remind me" toggles and persists.
  - Post a non-popup listing: price still required and stored.
  - Contact chips: only filled methods appear, pre-selected, ≥1 enforced; reveal-approval email lists every selected method.
- [ ] **Reminder cron (optional smoke):** call `GET /api/cron/popup-reminders` with `Authorization: Bearer $CRON_SECRET` → 200 `{ ok: true, sent: N }`; without the header → 401.

## Notes / manual steps outside code

- Apply migration `017_popup_events.sql` to Supabase.
- Set `CRON_SECRET` in the environment; register an hourly external call to `/api/cron/popup-reminders`.
- `profiles.contact_method` column is intentionally **left in place** (non-destructive), just unused.
