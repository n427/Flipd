# Listing Match Digest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send each user at most one daily email listing up to 5 new listings Claude judged relevant to what that user has saved, messaged about, and searched for — and send nothing when there is no good match.

**Architecture:** A new `search_events` table captures what users search. A producer in the existing hourly sweep builds a per-user interest profile from three signals (saves, reveal requests, searches), asks Claude to pick matches from the last day's listings, and emails the winners. `last_digest_at` on `profiles` enforces one-per-day; a send window keeps it out of the middle of the night.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres + RLS), `@anthropic-ai/sdk` ^0.100.1, Vitest.

## Global Constraints

- **Model is `claude-opus-5`**, referenced through the single exported constant `DIGEST_MODEL` in `src/lib/digest/match.ts`. Do not inline the string anywhere else. (The approved spec said "Haiku"; that was a cost suggestion, not a requirement — the constant is the seam for changing it.)
- **No zod in this repo.** Structured output uses a raw JSON Schema under `output_config.format`, not `zodOutputFormat`.
- **No plaintext user PII in logs.** Log user ids and counts, never emails, phone numbers, or search text.
- **Cold start = no digest.** A user with zero signals gets no email, ever. Never fall back to "here are some listings."
- **No matches = no notification.** An empty match list is a successful run that sends nothing.
- **Fail per-user, not per-batch.** One user's error must never suppress every other user's digest, and must never stamp `last_digest_at` for a user who was not emailed.
- **Preference key is `listing_match`**, checked with the existing `wantsEmail` helper in `src/lib/notify.ts`.
- **Send window:** 09:00–21:00 `America/Los_Angeles`. Outside it, the producer returns zero counts and stamps nothing.
- **`last_digest_at` gate is 20 hours**, not 24 — the sweep runs hourly and a strict 24 would drift a user's digest an hour later each day until it fell out of the window.
- Every new file gets tests under `src/**/*.test.ts` (the Vitest `include` glob). Vitest does **not** load `.env.local`; tests must never require env vars.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/034_listing_digest.sql` | `search_events` table + RLS, `profiles.last_digest_at`, retention index |
| `src/app/api/search-events/route.ts` | POST endpoint both clients call to record a search |
| `src/lib/digest/window.ts` | Pure: is now inside the send window; is a user due |
| `src/lib/digest/profile.ts` | Pure: fold raw signal rows into one interest profile string |
| `src/lib/digest/match.ts` | The Claude call — `DIGEST_MODEL`, schema, prompt, parse |
| `src/lib/digest/index.ts` | The producer: query → profile → match → email → stamp |
| `src/lib/sweep/index.ts` | Modify: register the digest producer |
| `src/lib/notify.ts` | Modify: add `digestEmail(matches)` |
| `src/lib/store.ts` (web) / `mobile/src/lib/listings.ts` | Modify: fire-and-forget search capture |

---

### Task 1: Migration — search_events and last_digest_at

**Files:**
- Create: `supabase/migrations/034_listing_digest.sql`

**Interfaces:**
- Produces: table `public.search_events(id, user_id, query, created_at)`; column `public.profiles.last_digest_at timestamptz`.

- [ ] **Step 1: Write the migration**

```sql
-- 034_listing_digest.sql
-- Captures what users search for, so the daily digest can tell the difference
-- between "listings we have" and "listings this person would want".

create table if not exists public.search_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  query text not null,
  created_at timestamptz not null default now()
);

-- The digest reads a 30-day window per user; this is the only access pattern.
create index if not exists search_events_user_recent_idx
  on public.search_events (user_id, created_at desc);

alter table public.search_events enable row level security;

-- Users may write their own search history and read it back. There is no
-- update or delete policy: search history is append-only, and the digest
-- producer reads it with the service role, which bypasses RLS entirely.
create policy search_events_insert_own on public.search_events
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy search_events_select_own on public.search_events
  for select to authenticated
  using (auth.uid() = user_id);

-- Nullable and null for every existing user: a user who has never received a
-- digest is due for one as soon as they have signals, which is what we want.
alter table public.profiles
  add column if not exists last_digest_at timestamptz;

-- last_digest_at is written only by the service-role producer. Adding it to
-- the authenticated UPDATE grant would let a user suppress or replay their own
-- digest, so it is deliberately excluded (see 033_sms_consent.sql).
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/034_listing_digest.sql
git commit -m "feat(db): add search_events and profiles.last_digest_at"
```

---

### Task 2: Search capture endpoint and client calls

**Files:**
- Create: `src/app/api/search-events/route.ts`
- Create: `src/app/api/search-events/route.test.ts`
- Modify: `src/lib/store.ts` (web search path), `mobile/src/lib/listings.ts` (mobile search path)

**Interfaces:**
- Consumes: `search_events` from Task 1.
- Produces: `POST /api/search-events` accepting `{ query: string }`, returning `{ ok: true }`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { normalizeQuery } from './route';

describe('normalizeQuery', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeQuery('  north   face  ')).toBe('north face');
  });
  it('rejects empty and whitespace-only queries', () => {
    expect(normalizeQuery('   ')).toBeNull();
  });
  it('caps length so a pasted essay cannot bloat the digest prompt', () => {
    expect(normalizeQuery('x'.repeat(500))?.length).toBe(200);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/app/api/search-events/route.test.ts`
Expected: FAIL — `normalizeQuery` is not exported.

- [ ] **Step 3: Implement the route**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createRouteClient } from '@/lib/supabase/route';

// Queries feed a prompt, so bound them. 200 chars is far past any real search
// and short enough that 30 days of them stay a reasonable prompt size.
export function normalizeQuery(raw: string): string | null {
  const q = (raw ?? '').trim().replace(/\s+/g, ' ');
  if (!q) return null;
  return q.slice(0, 200);
}

export async function POST(req: NextRequest) {
  const supabase = createRouteClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const query = normalizeQuery(body?.query);
  // A blank search is not an error the client should retry — it is just not
  // a signal. Return ok so the fire-and-forget caller stays silent.
  if (!query) return NextResponse.json({ ok: true });

  await supabase.from('search_events').insert({ user_id: user.id, query });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/app/api/search-events/route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire both clients**

In the web search handler and the mobile search handler, after a search runs, fire and forget. Search must never block or fail on this:

```ts
// Recording a search is telemetry for the digest, not part of the search.
// Never await it, never surface its failure — a dropped signal costs one
// slightly worse digest; a thrown error costs the user their search.
void fetch(`${API_BASE}/api/search-events`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ query }),
}).catch(() => {});
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/search-events src/lib/store.ts mobile/src/lib/listings.ts
git commit -m "feat(digest): capture search events from web and mobile"
```

---

### Task 3: Window gate and interest profile (both pure)

**Files:**
- Create: `src/lib/digest/window.ts`, `src/lib/digest/window.test.ts`
- Create: `src/lib/digest/profile.ts`, `src/lib/digest/profile.test.ts`

**Interfaces:**
- Produces:
  - `isInSendWindow(now: Date): boolean`
  - `isDue(lastDigestAt: string | null, now: Date): boolean`
  - `buildProfile(signals: Signals): string | null` where
    `type Signals = { saved: string[]; messaged: string[]; searched: string[] }`

- [ ] **Step 1: Write the failing tests**

```ts
// window.test.ts
import { describe, it, expect } from 'vitest';
import { isInSendWindow, isDue, DIGEST_GAP_MS } from './window';

describe('isInSendWindow', () => {
  it('accepts mid-morning Pacific', () => {
    expect(isInSendWindow(new Date('2026-08-10T17:00:00Z'))).toBe(true); // 10am PDT
  });
  it('rejects the middle of the night Pacific', () => {
    expect(isInSendWindow(new Date('2026-08-10T10:00:00Z'))).toBe(false); // 3am PDT
  });
  it('uses Pacific local time, not UTC — 21:00Z is 2pm PDT and allowed', () => {
    expect(isInSendWindow(new Date('2026-08-10T21:00:00Z'))).toBe(true);
  });
});

describe('isDue', () => {
  const now = new Date('2026-08-10T17:00:00Z');
  it('a user who never got one is due', () => {
    expect(isDue(null, now)).toBe(true);
  });
  it('19 hours ago is not yet due', () => {
    expect(isDue(new Date(now.getTime() - 19 * 3600_000).toISOString(), now)).toBe(false);
  });
  it('21 hours ago is due — the 20h gap lets a daily digest hold its slot', () => {
    expect(isDue(new Date(now.getTime() - 21 * 3600_000).toISOString(), now)).toBe(true);
  });
  it('exposes the gap as 20 hours', () => {
    expect(DIGEST_GAP_MS).toBe(20 * 3600_000);
  });
});
```

```ts
// profile.test.ts
import { describe, it, expect } from 'vitest';
import { buildProfile } from './profile';

describe('buildProfile', () => {
  it('returns null with no signals — cold start means no digest', () => {
    expect(buildProfile({ saved: [], messaged: [], searched: [] })).toBeNull();
  });
  it('labels each signal so the model can weight them', () => {
    const p = buildProfile({ saved: ['desk lamp'], messaged: ['mini fridge'], searched: ['rug'] })!;
    expect(p).toContain('Saved: desk lamp');
    expect(p).toContain('Messaged about: mini fridge');
    expect(p).toContain('Searched: rug');
  });
  it('dedupes repeats — searching "rug" ten times is one interest, not ten', () => {
    const p = buildProfile({ saved: [], messaged: [], searched: ['rug', 'rug', 'rug'] })!;
    expect(p.match(/rug/g)).toHaveLength(1);
  });
  it('omits empty categories rather than printing an empty label', () => {
    const p = buildProfile({ saved: ['lamp'], messaged: [], searched: [] })!;
    expect(p).not.toContain('Messaged about:');
  });
});
```

- [ ] **Step 2: Run and watch both fail**

Run: `npx vitest run src/lib/digest/`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

```ts
// window.ts
// The sweep runs hourly, so a strict 24h gap would push each user's digest an
// hour later every day until it drifted out of the send window entirely. 20h
// lets a daily digest keep roughly the same slot.
export const DIGEST_GAP_MS = 20 * 3600_000;

const SEND_TZ = 'America/Los_Angeles';
const WINDOW_START_HOUR = 9;
const WINDOW_END_HOUR = 21;

export function isInSendWindow(now: Date): boolean {
  // Intl, not a fixed UTC offset: Pacific is UTC-7 in summer and UTC-8 in
  // winter, and hardcoding either would shift the window by an hour half the year.
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: SEND_TZ, hour: 'numeric', hour12: false,
    }).format(now)
  );
  return hour >= WINDOW_START_HOUR && hour < WINDOW_END_HOUR;
}

export function isDue(lastDigestAt: string | null, now: Date): boolean {
  if (!lastDigestAt) return true;
  return now.getTime() - new Date(lastDigestAt).getTime() >= DIGEST_GAP_MS;
}
```

```ts
// profile.ts
export type Signals = { saved: string[]; messaged: string[]; searched: string[] };

// Caps per category: a heavy user's whole history would dominate the prompt
// and cost more without matching better. Most-recent-first is applied by the
// caller's query ordering, so slicing here keeps the freshest signals.
const PER_CATEGORY_CAP = 20;

function clean(items: string[]): string[] {
  return [...new Set(items.map((s) => s.trim()).filter(Boolean))].slice(0, PER_CATEGORY_CAP);
}

export function buildProfile(signals: Signals): string | null {
  const saved = clean(signals.saved);
  const messaged = clean(signals.messaged);
  const searched = clean(signals.searched);

  const lines: string[] = [];
  // Labels are load-bearing: the model treats a save as a stronger signal than
  // a search, and it can only do that if it can tell them apart.
  if (saved.length) lines.push(`Saved: ${saved.join(', ')}`);
  if (messaged.length) lines.push(`Messaged about: ${messaged.join(', ')}`);
  if (searched.length) lines.push(`Searched: ${searched.join(', ')}`);

  // No signals at all is the cold-start case: the caller must send nothing
  // rather than fall back to generic listings.
  return lines.length ? lines.join('\n') : null;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/digest/`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/digest/window.ts src/lib/digest/window.test.ts src/lib/digest/profile.ts src/lib/digest/profile.test.ts
git commit -m "feat(digest): add send-window gate and interest profile builder"
```

---

### Task 4: The Claude matcher

**Files:**
- Create: `src/lib/digest/match.ts`, `src/lib/digest/match.test.ts`

**Interfaces:**
- Consumes: `buildProfile` from Task 3.
- Produces:
  - `export const DIGEST_MODEL = 'claude-opus-5'`
  - `export const MAX_MATCHES = 5`
  - `matchListings(profile: string, listings: Candidate[]): Promise<Match[]>`
  - `type Candidate = { id: string; title: string; price: number; category: string }`
  - `type Match = { id: string; reason: string }`
  - `parseMatches(text: string, valid: Set<string>): Match[]` — exported for tests

- [ ] **Step 1: Write the failing test**

The network call is not unit-tested; `parseMatches` is where the risk lives.

```ts
import { describe, it, expect } from 'vitest';
import { parseMatches, MAX_MATCHES, DIGEST_MODEL } from './match';

const valid = new Set(['a', 'b', 'c']);

describe('parseMatches', () => {
  it('parses well-formed output', () => {
    const out = parseMatches(JSON.stringify({ matches: [{ id: 'a', reason: 'like your lamp' }] }), valid);
    expect(out).toEqual([{ id: 'a', reason: 'like your lamp' }]);
  });
  it('drops ids that were not in the candidate set — a hallucinated id would 404 in the email', () => {
    const out = parseMatches(JSON.stringify({ matches: [{ id: 'zzz', reason: 'x' }] }), valid);
    expect(out).toEqual([]);
  });
  it('returns [] on unparseable output rather than throwing', () => {
    expect(parseMatches('not json', valid)).toEqual([]);
  });
  it('returns [] when the model correctly finds nothing', () => {
    expect(parseMatches(JSON.stringify({ matches: [] }), valid)).toEqual([]);
  });
  it('caps at MAX_MATCHES even if the model returns more', () => {
    const many = { matches: ['a', 'b', 'c', 'a', 'b', 'c'].map((id) => ({ id, reason: 'r' })) };
    expect(parseMatches(JSON.stringify(many), valid).length).toBeLessThanOrEqual(MAX_MATCHES);
  });
  it('pins the model behind one constant', () => {
    expect(DIGEST_MODEL).toBe('claude-opus-5');
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/lib/digest/match.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import Anthropic from '@anthropic-ai/sdk';

// One constant, one place to change the cost/quality tradeoff. The approved
// spec suggested Haiku for cost; opus-5 is the default because model choice
// belongs to the operator, not to a silent default buried in a prompt.
export const DIGEST_MODEL = 'claude-opus-5';
export const MAX_MATCHES = 5;

export type Candidate = { id: string; title: string; price: number; category: string };
export type Match = { id: string; reason: string };

const SCHEMA = {
  type: 'object',
  properties: {
    matches: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['id', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['matches'],
  additionalProperties: false,
} as const;

// Stable across every user in a run, so it sits first and can be cached.
const SYSTEM = `You match secondhand campus-marketplace listings to one student's demonstrated interests.

Return only listings that student would plausibly want. Returning nothing is the correct answer when nothing fits — an empty list costs nobody anything, and a bad match teaches them to ignore the emails.

Weight the signals: a saved item is the strongest, a listing they messaged about is nearly as strong, a search is weaker and may be stale. Prefer the same category or a close substitute over a loose thematic link.

Give at most ${MAX_MATCHES} matches. Each reason is one short clause naming the specific prior interest it echoes, written to the student ("similar to the desk lamp you saved").`;

// Never throws: the digest is best-effort, and a malformed response should
// cost one user one email, not break the sweep.
export function parseMatches(text: string, valid: Set<string>): Match[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const raw = (parsed as { matches?: unknown })?.matches;
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const out: Match[] = [];
  for (const m of raw) {
    const id = (m as Match)?.id;
    const reason = (m as Match)?.reason;
    if (typeof id !== 'string' || typeof reason !== 'string') continue;
    // A model-invented id would render a dead link in a real email.
    if (!valid.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, reason });
    if (out.length >= MAX_MATCHES) break;
  }
  return out;
}

export async function matchListings(profile: string, listings: Candidate[]): Promise<Match[]> {
  if (!listings.length) return [];
  const client = new Anthropic();

  const res = await client.messages.create({
    model: DIGEST_MODEL,
    // Adaptive thinking is on by default on opus-5 and max_tokens caps
    // thinking + output together, so this is sized for both, not just the
    // few hundred tokens of JSON we actually want back.
    max_tokens: 8000,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    output_config: {
      // A ranking task, not a research task. Low effort keeps a per-user
      // daily job affordable without hurting match quality.
      effort: 'low',
      format: { type: 'json_schema', schema: SCHEMA },
    },
    messages: [
      {
        role: 'user',
        content: `This student's activity:\n${profile}\n\nNew listings:\n${JSON.stringify(listings)}`,
      },
    ],
  });

  const text = res.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') return [];
  return parseMatches(text.text, new Set(listings.map((l) => l.id)));
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/digest/match.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/digest/match.ts src/lib/digest/match.test.ts
git commit -m "feat(digest): add Claude listing matcher with strict id validation"
```

---

### Task 5: The producer, wired into the sweep

**Files:**
- Create: `src/lib/digest/index.ts`
- Modify: `src/lib/sweep/index.ts` (register the producer), `src/lib/notify.ts` (add `digestEmail`)

**Interfaces:**
- Consumes: `isInSendWindow`/`isDue` (Task 3), `buildProfile` (Task 3), `matchListings` (Task 4), the `Producer` type and `wantsEmail` already in the repo.
- Produces: `export const digestProducer: Producer` with `name: 'digest'`.

- [ ] **Step 1: Implement the producer**

The ordering of the gates and the stamp is the whole correctness story — do not reorder:

```ts
import type { Producer } from '@/lib/sweep';
import { admin } from '@/lib/supabase/admin';
import { isInSendWindow, isDue } from './window';
import { buildProfile } from './profile';
import { matchListings, type Candidate } from './match';
import { wantsEmail, digestEmail } from '@/lib/notify';

// Bounds. CANDIDATE_CAP keeps the prompt affordable; USER_CAP keeps one sweep
// tick from running for an hour. Both are well under PostgREST's 1000-row
// default, so neither query is silently truncated.
const CANDIDATE_CAP = 100;
const USER_CAP = 200;
const SIGNAL_CAP = 20;

export const digestProducer: Producer = {
  name: 'digest',
  async run() {
    const now = new Date();
    // Cheapest gate first: outside the window there is nothing to do, and no
    // row should be read or stamped.
    if (!isInSendWindow(now)) return { digests: 0, skipped_window: 1 };

    const dayAgo = new Date(now.getTime() - 24 * 3600_000).toISOString();
    const dueBefore = new Date(now.getTime() - 20 * 3600_000).toISOString();

    // One candidate set shared by every user this tick — the listings are the
    // same for everyone, only the ranking differs.
    const { data: listings, error: listErr } = await admin
      .from('listings')
      .select('id, title, price, category, seller_id')
      .eq('archived', false)
      .gte('created_at', dayAgo)
      .order('created_at', { ascending: false })
      .limit(CANDIDATE_CAP);
    if (listErr) throw new Error(`candidate query failed: ${listErr.message}`);
    if (!listings?.length) return { digests: 0, no_candidates: 1 };

    // seller_id is fetched to filter own-listings, then stripped before the
    // prompt — the model has no use for it and it is not ours to hand over.
    const candidates = listings as (Candidate & { seller_id: string })[];

    const { data: users, error: userErr } = await admin
      .from('profiles')
      .select('id, email, notify_prefs, last_digest_at')
      .or(`last_digest_at.is.null,last_digest_at.lt.${dueBefore}`)
      .limit(USER_CAP);
    if (userErr) throw new Error(`user query failed: ${userErr.message}`);

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const user of users ?? []) {
      // Per-user try/catch is the whole failure story: one user's bad row,
      // model hiccup, or mail bounce must not suppress everyone else's digest
      // — and must not stamp, so tomorrow's run retries instead of silently
      // dropping that user forever.
      try {
        if (!isDue(user.last_digest_at, now)) { skipped++; continue; }
        if (!wantsEmail(user.notify_prefs, 'listing_match')) { skipped++; continue; }
        if (!user.email) { skipped++; continue; }

        // Three signals. Deliberately three round-trips rather than one
        // batched join: a batched query turns a per-user failure into an
        // all-user failure, which is exactly the bug that bit the reminder
        // producer.
        const [saved, messaged, searched] = await Promise.all([
          admin.from('saves').select('listings(title)')
            .eq('user_id', user.id).limit(SIGNAL_CAP),
          admin.from('reveal_requests').select('listings(title)')
            .eq('buyer_id', user.id)
            .order('created_at', { ascending: false }).limit(SIGNAL_CAP),
          admin.from('search_events').select('query')
            .eq('user_id', user.id)
            .gte('created_at', new Date(now.getTime() - 30 * 86400_000).toISOString())
            .order('created_at', { ascending: false }).limit(SIGNAL_CAP),
        ]);

        const profile = buildProfile({
          saved: (saved.data ?? []).map((r: any) => r.listings?.title).filter(Boolean),
          messaged: (messaged.data ?? []).map((r: any) => r.listings?.title).filter(Boolean),
          searched: (searched.data ?? []).map((r: any) => r.query).filter(Boolean),
        });
        // Cold start: no signals means no digest, ever. Never fall back to
        // "here are some listings" — an unasked-for email is how people learn
        // to ignore all of them.
        if (!profile) { skipped++; continue; }

        // Never show someone their own listing back to them, and strip
        // seller_id on the way into the prompt.
        const pool: Candidate[] = candidates
          .filter((c) => c.seller_id !== user.id)
          .map(({ id, title, price, category }) => ({ id, title, price, category }));
        if (!pool.length) { skipped++; continue; }

        const matches = await matchListings(profile, pool);
        // No matches is a successful run that sends nothing.
        if (!matches.length) { skipped++; continue; }

        await digestEmail(user.email, matches, pool);

        // Stamp LAST, and only on a real send. Stamping before the send would
        // mean a mail failure costs the user a full day.
        await admin.from('profiles')
          .update({ last_digest_at: now.toISOString() })
          .eq('id', user.id);
        sent++;
      } catch (err) {
        // user.id only — never the email, never the search text.
        console.error('[digest] user failed', user.id, (err as Error).message);
        failed++;
      }
    }

    return { digests: sent, skipped, errors: failed };
  },
};
```

**Verified against the live schema:** `listings.seller_id uuid not null references profiles(id)` (`002_listings_seller_fk.sql`), and `listings.archived` backs `listings_feed_idx (archived, created_at desc)` — so the candidate query is index-aligned. `reveal_requests` keys the buyer as `buyer_id`, not `user_id`. `saves` is `(user_id, listing_id)` with no timestamp, which is why saves are unordered while the other two signals are most-recent-first.

- [ ] **Step 2: Add `digestEmail` to `src/lib/notify.ts`**

Follow the shape of the existing `popupReminderEmail`. Subject names the count (`3 listings you might want`); the body lists each title, price, reason, and a link. Include the same unsubscribe/settings footer the sibling emails use.

- [ ] **Step 3: Register in the sweep**

```ts
// src/lib/sweep/index.ts — add to the producer list
import { digestProducer } from '@/lib/digest';
// ... producers: [dueRemindersProducer, digestProducer]
```

- [ ] **Step 4: Run the full suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all existing tests still pass; `tsc` exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/digest/index.ts src/lib/sweep/index.ts src/lib/notify.ts
git commit -m "feat(digest): wire daily listing-match digest into the hourly sweep"
```

---

## Operator steps (human only — not agent work)

1. Apply `034_listing_digest.sql` in the Supabase SQL editor.
2. Confirm `ANTHROPIC_API_KEY` is set in Vercel (Production **and** Preview). It is absent from `.env.local` and read by no current source file — the digest is the first consumer, so it will silently return zero matches without it.
3. Verify: `select count(*) from public.search_events;` after running a search in the app.
