# Wanted Marketplace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete reverse-marketplace flow across web and mobile where buyers post Wanted requests, sellers submit private offers, and accepting one offer opens a shared Flipd transaction and conversation.

**Architecture:** Keep sale listings and Wanted posts as separate domain models. Add `wanted_posts` and `wanted_offers`, use one transactional database function for offer acceptance, and generalize only the shared thread/rating/reporting boundaries with an exactly-one-source constraint. Backend support deploys additively before either client exposes the feature.

**Tech Stack:** PostgreSQL/Supabase migrations and RLS, Next.js 16 route handlers, React 19, TypeScript 5.5, Vitest, Expo SDK 54, React Native 0.81, Supabase Storage, Expo Notifications/EAS.

**Spec:** `docs/superpowers/specs/2026-08-25-wanted-marketplace-design.md`

## Global Constraints

- Preserve every existing sale-listing, reveal-request, chat, completion, rating, reporting, and account-deletion behavior.
- Wanted is first-class on both web and mobile; activate both clients only after additive backend support is deployed and verified.
- A Wanted post requires title, one of `services`, `goods`, or `housing`, positive maximum budget, meetup area, description, and a future needed-by date; store that date as 11:59:59 PM America/Los_Angeles converted to UTC. Reference photos are optional, maximum six.
- A private offer requires at least one photo, positive whole-dollar price, condition/description, and message.
- Public Wanted DTOs never expose seller identity, offer text, or private offer media; private offers are visible only to their buyer and seller.
- Accepting an offer must be atomic, idempotent for the same winner, and produce exactly one accepted offer, one fulfilled post, and one thread.
- Each shared thread and rating references exactly one source: sale request or Wanted offer.
- Bidirectional blocking, reporting, notification preferences, upload rollback, account deletion, completion, ratings, and conversation deletion apply to Wanted transactions.
- Use TDD for every production behavior: write a focused failing test, observe the expected failure, add minimal implementation, rerun focused and affected suites, then commit.
- Do not activate navigation or ship a mobile build until database, API, web, and mobile release gates pass.

---

### Task 1: Add Wanted database schema and private media storage

**Files:**
- Create: `supabase/migrations/039_wanted_marketplace.sql`
- Create: `src/lib/wanted-contract.test.ts`
- Create: `src/lib/wanted-contract.ts`

**Interfaces:**
- Consumes: existing `profiles`, `blocks`, `message_threads`, `ratings`, `reports`, and storage conventions from migrations 019, 021, 025, 026, 037, and 038.
- Produces: `WantedPostStatus`, `WantedOfferStatus`, `effectiveWantedStatus(status, neededBy, now)`, plus database tables, constraints, indexes, buckets, and RLS used by all later tasks.

- [ ] **Step 1: Write failing contract tests**

```ts
import { describe, expect, it } from 'vitest';
import { effectiveWantedStatus, isWantedCategory } from './wanted-contract';

describe('Wanted contract', () => {
  it('treats an active post past needed_by as expired', () => {
    expect(effectiveWantedStatus('active', '2026-08-25T10:00:00.000Z', new Date('2026-08-25T10:00:01.000Z'))).toBe('expired');
  });

  it('does not override fulfilled or deleted status', () => {
    expect(effectiveWantedStatus('fulfilled', '2026-08-20T10:00:00.000Z', new Date('2026-08-25T10:00:00.000Z'))).toBe('fulfilled');
    expect(effectiveWantedStatus('deleted', '2026-08-20T10:00:00.000Z', new Date('2026-08-25T10:00:00.000Z'))).toBe('deleted');
  });

  it('excludes the event category from Wanted posts', () => {
    expect(isWantedCategory('goods')).toBe(true);
    expect(isWantedCategory('event')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the focused test and observe RED**

Run: `npm test -- src/lib/wanted-contract.test.ts`

Expected: FAIL because `src/lib/wanted-contract.ts` does not exist.

- [ ] **Step 3: Implement the contract module**

```ts
export type WantedPostStatus = 'active' | 'fulfilled' | 'expired' | 'deleted';
export type WantedOfferStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'expired';

export function effectiveWantedStatus(status: WantedPostStatus, neededBy: string, now = new Date()): WantedPostStatus {
  return status === 'active' && new Date(neededBy).getTime() <= now.getTime() ? 'expired' : status;
}

export function isWantedCategory(category: string): boolean {
  return ['goods', 'services', 'housing'].includes(category);
}
```

- [ ] **Step 4: Create the additive migration**

The migration must create:

```sql
create table public.wanted_posts (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 60),
  category text not null check (category in ('goods','services','housing')),
  max_budget integer not null check (max_budget > 0),
  description text not null check (char_length(trim(description)) between 1 and 2000),
  location text not null check (char_length(trim(location)) between 1 and 160),
  place_name text, lat double precision, lng double precision,
  photo_urls text[] not null default '{}',
  needed_by timestamptz not null,
  status text not null default 'active' check (status in ('active','fulfilled','expired','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.wanted_offers (
  id uuid primary key default gen_random_uuid(),
  wanted_post_id uuid not null references public.wanted_posts(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  price integer not null check (price > 0),
  description text not null check (char_length(trim(description)) between 1 and 2000),
  message text not null check (char_length(trim(message)) between 1 and 1000),
  photo_paths text[] not null check (cardinality(photo_paths) between 1 and 6),
  status text not null default 'pending' check (status in ('pending','accepted','declined','withdrawn','expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  completed_at timestamptz,
  check (seller_id <> buyer_id)
);

create unique index wanted_offers_seller_post_uniq on public.wanted_offers(wanted_post_id, seller_id);
create index wanted_posts_feed_idx on public.wanted_posts(status, created_at desc);
create index wanted_posts_category_idx on public.wanted_posts(category, status, needed_by);
create index wanted_posts_buyer_idx on public.wanted_posts(buyer_id, created_at desc);
create index wanted_offers_buyer_idx on public.wanted_offers(buyer_id, status, created_at desc);
create index wanted_offers_seller_idx on public.wanted_offers(seller_id, status, created_at desc);
```

Also add authenticated RLS for active public posts and owner history, participant-only offers, owner inserts/edits that cannot change protected identity/status columns, and a private `wanted-offer-photos` bucket whose object prefix is `{seller_id}/{offer_id}/...`. Create owner-scoped `wanted-reference-photos` policies matching listing-photo validation.

Offer IDs are generated client-side before upload. Storage policies accept only UUID-shaped `{auth.uid()}/{offer_id}/...` paths; the POST route accepts that client UUID as `id`, verifies every path contains the same ID, and binds the row to the authenticated seller. This removes the upload/create chicken-and-egg without exposing private objects.

- [ ] **Step 5: Verify GREEN and migration syntax**

Run:

```bash
npm test -- src/lib/wanted-contract.test.ts
npx tsc --noEmit
git diff --check
```

Expected: 3 tests pass, TypeScript exits 0, diff check exits 0.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/039_wanted_marketplace.sql src/lib/wanted-contract.ts src/lib/wanted-contract.test.ts
git commit -m "feat(wanted): add marketplace schema"
```

### Task 2: Add transactional offer acceptance and generalized transaction sources

**Files:**
- Create: `supabase/migrations/040_wanted_transactions.sql`
- Create: `src/lib/wanted-transition.test.ts`
- Create: `src/lib/wanted-transition.ts`
- Modify: `src/lib/messaging.ts`

**Interfaces:**
- Consumes: Task 1 tables and status types.
- Produces: `accept_wanted_offer(target_offer_id uuid, actor_id uuid)` returning `thread_id`; `TransactionSource`; `parseTransactionSource`; nullable `message_threads.request_id`, unique `wanted_offer_id`, and analogous ratings/report targets.

- [ ] **Step 1: Write failing source-invariant tests**

```ts
import { describe, expect, it } from 'vitest';
import { parseTransactionSource } from './wanted-transition';

describe('transaction sources', () => {
  it('accepts exactly one source', () => {
    expect(parseTransactionSource({ request_id: 'sale-1', wanted_offer_id: null })).toEqual({ kind: 'sale', id: 'sale-1' });
    expect(parseTransactionSource({ request_id: null, wanted_offer_id: 'offer-1' })).toEqual({ kind: 'wanted', id: 'offer-1' });
  });

  it('rejects zero or two sources', () => {
    expect(parseTransactionSource({ request_id: null, wanted_offer_id: null })).toBeNull();
    expect(parseTransactionSource({ request_id: 'sale-1', wanted_offer_id: 'offer-1' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run RED**

Run: `npm test -- src/lib/wanted-transition.test.ts`

Expected: FAIL because `wanted-transition.ts` is missing.

- [ ] **Step 3: Implement the invariant helper**

```ts
export type TransactionSource = { kind: 'sale'; id: string } | { kind: 'wanted'; id: string };

export function parseTransactionSource(row: { request_id: string | null; wanted_offer_id: string | null }): TransactionSource | null {
  if (Boolean(row.request_id) === Boolean(row.wanted_offer_id)) return null;
  return row.request_id ? { kind: 'sale', id: row.request_id } : { kind: 'wanted', id: row.wanted_offer_id! };
}
```

- [ ] **Step 4: Generalize database sources additively**

Migration 040 must:

```sql
alter table public.message_threads alter column request_id drop not null;
alter table public.message_threads add column wanted_offer_id uuid unique references public.wanted_offers(id) on delete cascade;
alter table public.message_threads add constraint message_threads_one_source check (num_nonnulls(request_id, wanted_offer_id) = 1);

alter table public.ratings alter column request_id drop not null;
alter table public.ratings add column wanted_offer_id uuid references public.wanted_offers(id) on delete cascade;
alter table public.ratings add constraint ratings_one_source check (num_nonnulls(request_id, wanted_offer_id) = 1);
create unique index ratings_wanted_once on public.ratings(wanted_offer_id, rater_id) where wanted_offer_id is not null;

alter table public.reports add column target_wanted_post_id uuid references public.wanted_posts(id) on delete set null;
alter table public.reports add column target_wanted_offer_id uuid references public.wanted_offers(id) on delete set null;
alter table public.reports drop constraint reports_at_most_one_target;
alter table public.reports add constraint reports_at_most_one_target check (
  num_nonnulls(target_listing_id, target_user_id, target_thread_id, target_wanted_post_id, target_wanted_offer_id) <= 1
);
```

Create `accept_wanted_offer` as a security-definer transaction function that locks the offer and post `for update`, verifies actor equals `buyer_id`, evaluates deadline, verifies both rows are live, updates the selected and competing offers, fulfills the post, upserts a thread on `wanted_offer_id`, and returns its ID. Revoke it from public/anon/authenticated and grant only to `service_role`; routes still perform authorization before invoking it.

- [ ] **Step 5: Update `ThreadRow` to represent either source**

```ts
export type ThreadRow = {
  id: string;
  request_id: string | null;
  wanted_offer_id: string | null;
  // existing participant, title, timing, and seen fields unchanged
};
```

Select both source columns in `loadThreadForUser` and assert `parseTransactionSource(row)` is non-null before returning.

- [ ] **Step 6: Verify and commit**

Run:

```bash
npm test -- src/lib/wanted-transition.test.ts
npm test
npx tsc --noEmit
```

Expected: focused and full suites pass; TypeScript exits 0.

```bash
git add supabase/migrations/040_wanted_transactions.sql src/lib/wanted-transition.ts src/lib/wanted-transition.test.ts src/lib/messaging.ts
git commit -m "feat(wanted): add atomic offer acceptance"
```

### Task 3: Implement Wanted post validation, DTOs, and APIs

**Files:**
- Create: `src/lib/wanted.ts`
- Create: `src/lib/wanted.test.ts`
- Create: `src/app/api/wanted/route.ts`
- Create: `src/app/api/wanted/[id]/route.ts`
- Modify: `src/lib/types.ts`

**Interfaces:**
- Consumes: `effectiveWantedStatus`, `isWantedCategory`, `getRequestUser`, `admin`, existing block semantics.
- Produces: `WantedPostInput`, `WantedPostDTO`, `parseWantedPostInput`, `toPublicWantedPost`, feed/detail/create/edit/delete endpoints.

- [ ] **Step 1: Write failing validation/privacy tests**

```ts
import { describe, expect, it } from 'vitest';
import { parseWantedPostInput, toPublicWantedPost } from './wanted';

describe('Wanted posts', () => {
  it('requires a future deadline and positive whole-dollar budget', () => {
    expect(parseWantedPostInput({ title: 'Desk', category: 'goods', max_budget: 80, description: 'Wood desk', location: 'Village', needed_by: '2026-09-01T12:00:00Z' }, new Date('2026-08-25T12:00:00Z')).ok).toBe(true);
    expect(parseWantedPostInput({ title: 'Desk', category: 'goods', max_budget: 0, description: 'Wood desk', location: 'Village', needed_by: '2026-09-01T12:00:00Z' }, new Date('2026-08-25T12:00:00Z')).ok).toBe(false);
  });

  it('exposes only aggregate offer count publicly', () => {
    const dto = toPublicWantedPost({ id: 'p1', buyer_id: 'b1', title: 'Desk', category: 'goods', max_budget: 80, description: 'Wood', location: 'Village', photo_urls: [], needed_by: '2026-09-01T12:00:00Z', status: 'active', created_at: '2026-08-25T12:00:00Z', offers: [{ count: 3 }] });
    expect(dto.offer_count).toBe(3);
    expect(dto).not.toHaveProperty('offers');
  });
});
```

- [ ] **Step 2: Run RED**

Run: `npm test -- src/lib/wanted.test.ts`

Expected: FAIL because `wanted.ts` is missing.

- [ ] **Step 3: Implement focused validators and DTO mapping**

`parseWantedPostInput` must trim strings, cap title at 60 and description at 2000, require a recognized category, positive integer budget, future ISO deadline, at most six HTTPS photo URLs, and return `{ ok: true, value } | { ok: false, error }`. `toPublicWantedPost` must explicitly construct the response rather than spread a database row.

- [ ] **Step 4: Implement `GET/POST /api/wanted`**

GET accepts `q`, `category`, `budget`, `location`, `needed_before`, `mine`, `status`, `cursor`, and `limit` (max 50). Public mode returns active effective-unexpired posts and excludes both sides of blocks. Mine mode requires ownership and may return history. POST binds `buyer_id` to the authenticated user, ignores client status/identity fields, and returns `{ wanted_post }` with status 201.

- [ ] **Step 5: Implement detail/edit/delete route**

GET returns public detail plus owner-only management fields. PATCH permits only the owner of an active post and only editable content fields. DELETE permits the owner of any non-deleted post, sets status deleted/resolved time, and declines pending offers without deleting an accepted thread.

- [ ] **Step 6: Verify and commit**

Run:

```bash
npm test -- src/lib/wanted.test.ts
npm test
npm run lint
npx tsc --noEmit
```

Expected: all commands exit 0.

```bash
git add src/lib/wanted.ts src/lib/wanted.test.ts src/lib/types.ts src/app/api/wanted/route.ts 'src/app/api/wanted/[id]/route.ts'
git commit -m "feat(wanted): add post APIs"
```

### Task 4: Implement private offer APIs and acceptance

**Files:**
- Create: `src/lib/wanted-offers.ts`
- Create: `src/lib/wanted-offers.test.ts`
- Create: `src/app/api/wanted/[id]/offers/route.ts`
- Create: `src/app/api/wanted-offers/[id]/route.ts`
- Create: `src/app/api/wanted-offers/[id]/accept/route.ts`

**Interfaces:**
- Consumes: Task 2 RPC and Task 3 Wanted validators/auth rules.
- Produces: `WantedOfferInput`, `WantedOfferDTO`, `parseWantedOfferInput`, participant inbox DTOs, submit/edit/withdraw/decline/accept operations.

- [ ] **Step 1: Write failing offer tests**

```ts
import { describe, expect, it } from 'vitest';
import { parseWantedOfferInput, canMutateWantedOffer } from './wanted-offers';

describe('Wanted offers', () => {
  it('requires price, description, message, and one to six private photo paths', () => {
    expect(parseWantedOfferInput({ price: 70, description: 'Good condition', message: 'Can meet Friday', photo_paths: ['seller/offer/photo.jpg'] }).ok).toBe(true);
    expect(parseWantedOfferInput({ price: 70, description: '', message: 'Can meet Friday', photo_paths: [] }).ok).toBe(false);
  });

  it('allows edits and withdrawal only while pending', () => {
    expect(canMutateWantedOffer('pending')).toBe(true);
    expect(canMutateWantedOffer('accepted')).toBe(false);
    expect(canMutateWantedOffer('declined')).toBe(false);
  });
});
```

- [ ] **Step 2: Run RED and implement validators**

Run: `npm test -- src/lib/wanted-offers.test.ts`

Expected: FAIL because module is missing. Implement explicit parsing, status guard, and participant-only DTO mapping; rerun until PASS.

- [ ] **Step 3: Implement offer list and submit**

GET `/api/wanted/[id]/offers` permits only the post buyer and involved sellers; buyer receives all offers, seller receives only their own. POST verifies post is active/unexpired, actor is not buyer, parties are not blocked, photo paths begin with `${actor.id}/`, and upserts the seller/post record only when prior status is withdrawn.

- [ ] **Step 4: Implement edit/withdraw/decline**

PATCH accepts `{ action: 'edit', ...fields }` from the pending-offer seller or `{ action: 'decline' }` from the post buyer. DELETE is seller withdrawal. Every mutation rechecks effective post status and participant identity.

- [ ] **Step 5: Implement acceptance route**

POST authenticates the post buyer, verifies the selected offer belongs to them, invokes `admin.rpc('accept_wanted_offer', { target_offer_id: id, actor_id: user.id })`, and returns `{ thread_id }`. Map stale state to 409, unauthorized state to 403, missing state to 404, and unexpected database errors to 500.

- [ ] **Step 6: Verify and commit**

Run:

```bash
npm test -- src/lib/wanted-offers.test.ts
npm test
npm run lint
npx tsc --noEmit
```

```bash
git add src/lib/wanted-offers.ts src/lib/wanted-offers.test.ts 'src/app/api/wanted/[id]/offers/route.ts' 'src/app/api/wanted-offers/[id]/route.ts' 'src/app/api/wanted-offers/[id]/accept/route.ts'
git commit -m "feat(wanted): add private offer flow"
```

### Task 5: Generalize messaging, completion, ratings, reports, and deletion

**Files:**
- Modify: `src/app/api/threads/route.ts`
- Modify: `src/app/api/threads/[id]/route.ts`
- Modify: `src/app/api/threads/[id]/messages/route.ts`
- Modify: `src/app/api/ratings/route.ts`
- Modify: `src/app/api/reports/route.ts`
- Create: `src/app/api/transactions/[kind]/[id]/complete/route.ts`
- Modify: `src/lib/report-target.ts`
- Modify: `src/lib/report-target.test.ts`
- Create: `src/lib/transaction.ts`
- Create: `src/lib/transaction.test.ts`
- Modify: `src/lib/account-deletion.ts`
- Modify: `supabase/migrations/037_account_deletion.sql` only by adding a new migration: `supabase/migrations/041_wanted_cleanup.sql`

**Interfaces:**
- Consumes: `TransactionSource` and Task 1/2 tables.
- Produces: `loadTransaction(source)`, generalized thread DTOs, completion/rating/report behavior, and Wanted-aware account cleanup.

- [ ] **Step 1: Write failing transaction/report tests**

```ts
it('accepts a Wanted post or Wanted offer as the sole report target', () => {
  expect(parseReportTarget({ wanted_post_id: 'p1' })).toEqual({ kind: 'wanted_post', id: 'p1' });
  expect(parseReportTarget({ wanted_offer_id: 'o1' })).toEqual({ kind: 'wanted_offer', id: 'o1' });
  expect(parseReportTarget({ wanted_post_id: 'p1', thread_id: 't1' })).toBeNull();
});
```

Add transaction tests that hand `loadTransaction` a sale source and Wanted source adapter fixture and assert the same normalized fields: `buyerId`, `sellerId`, `title`, `price`, `status`, and `counterpartId`.

- [ ] **Step 2: Run RED**

Run: `npm test -- src/lib/report-target.test.ts src/lib/transaction.test.ts`

Expected: Wanted targets/source adapter assertions fail.

- [ ] **Step 3: Implement normalized transaction boundary**

```ts
export type NormalizedTransaction = {
  source: TransactionSource;
  buyerId: string;
  sellerId: string;
  title: string;
  price: number | null;
  status: 'approved' | 'completed';
};
```

The adapter loads reveal/listing data for sale sources and accepted offer/post data for Wanted sources. A Wanted offer remains `accepted`; `completed_at is not null` normalizes it to transaction status `completed`, otherwise `approved`. Route handlers consume this object instead of branching on table-specific columns throughout UI mapping.

- [ ] **Step 4: Generalize thread DTOs and detail**

Select both source columns. For Wanted threads, return `source_type: 'wanted'`, Wanted title, accepted price, first private offer photo signed for participants, and `listing_removed: false`; retain every existing sale DTO field for backward compatibility.

- [ ] **Step 5: Generalize completion and ratings**

Add `POST /api/transactions/[kind]/[id]/complete`, where `kind` is `sale` or `wanted`. It loads a normalized transaction, permits either participant, changes only an approved sale request to status `completed` or sets `wanted_offers.completed_at` on an accepted Wanted offer, and returns 409 for terminal state. Existing sale completion clients migrate to this route in the same commit. Ratings POST accepts exactly one of `request_id` or `wanted_offer_id`, derives the other party server-side, requires normalized status `completed`, and preserves anonymous GET aggregation.

- [ ] **Step 6: Generalize reports and cleanup**

Validate participant access before accepting a private offer report. Migration 041 updates `cleanup_deleted_account` to close owned Wanted posts/offers, remove private storage paths through the server route, anonymize retained accepted transaction references, and avoid deleting the counterpart's required transaction history.

- [ ] **Step 7: Verify and commit**

Run:

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Expected: full web suite, lint, typecheck, and production build pass.

```bash
git add src/app/api/threads src/app/api/ratings/route.ts src/app/api/reports/route.ts 'src/app/api/transactions/[kind]/[id]/complete/route.ts' src/lib/report-target.ts src/lib/report-target.test.ts src/lib/transaction.ts src/lib/transaction.test.ts src/lib/account-deletion.ts supabase/migrations/041_wanted_cleanup.sql
git commit -m "feat(wanted): share transaction services"
```

### Task 6: Add Wanted expiry, reminders, and notifications

**Files:**
- Create: `src/lib/sweep/wanted-lifecycle.ts`
- Create: `src/lib/sweep/wanted-lifecycle.test.ts`
- Modify: `src/lib/sweep/index.ts`
- Modify: `src/app/api/cron/sweep/route.ts`
- Modify: `src/lib/notify.ts`
- Modify: `src/lib/notify.test.ts`
- Create: `supabase/migrations/042_wanted_notifications.sql`
- Create: `src/app/api/notification-events/route.ts`

**Interfaces:**
- Consumes: existing sweep runner, push/email preference helpers, Wanted statuses.
- Produces: `dueWantedTransitions`, stable Wanted notification event keys, expiry/reminder processing.

- [ ] **Step 1: Write failing lifecycle tests**

```ts
it('selects a 24-hour reminder once and expires overdue active posts', () => {
  const result = dueWantedTransitions(rows, new Date('2026-08-25T12:00:00Z'));
  expect(result.remind.map((r) => r.id)).toEqual(['due-tomorrow']);
  expect(result.expire.map((r) => r.id)).toEqual(['past-due']);
});
```

Add notification tests asserting keys such as `wanted:new-offer:<offerId>`, `wanted:accepted:<offerId>`, and `wanted:edit:<postId>:<updatedAt>` are deterministic.

- [ ] **Step 2: Run RED and implement selection functions**

Run: `npm test -- src/lib/sweep/wanted-lifecycle.test.ts src/lib/notify.test.ts`

Expected: missing exports fail. Implement pure selectors first and rerun PASS.

- [ ] **Step 3: Persist idempotency and unread state**

Migration 042 adds `reminder_sent_at` to Wanted posts and creates `notification_events(id, event_key, user_id, event_type, wanted_post_id, wanted_offer_id, title, body, created_at, read_at, dismissed_at)` with `unique(event_key, user_id)`, source foreign keys, self-read RLS, and indexes for undismissed user recency and due deadlines. `GET /api/notification-events` returns the caller's undismissed rows; PATCH marks specified caller-owned IDs read or dismissed.

- [ ] **Step 4: Wire side effects**

The sweep expires posts and pending offers, sends the buyer a 24-hour reminder once, and notifies affected sellers when offers close. Offer create/accept/decline and material post edit routes invoke notification helpers after successful commits. Failures are logged and retryable without duplicating event rows.

- [ ] **Step 5: Verify and commit**

Run: `npm test && npm run lint && npx tsc --noEmit`

```bash
git add src/lib/sweep/wanted-lifecycle.ts src/lib/sweep/wanted-lifecycle.test.ts src/lib/sweep/index.ts src/app/api/cron/sweep/route.ts src/lib/notify.ts src/lib/notify.test.ts supabase/migrations/042_wanted_notifications.sql
git commit -m "feat(wanted): add lifecycle notifications"
```

### Task 7: Add shared web client state, navigation, and post chooser

**Files:**
- Create: `src/lib/wanted-client.ts`
- Create: `src/lib/wanted-client.test.ts`
- Modify: `src/lib/store.ts`
- Modify: `src/lib/store-context.tsx`
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/components/WebApp.tsx`
- Modify: `src/app/(app)/post/page.tsx`
- Create: `src/app/(app)/post/choose/page.tsx`

**Interfaces:**
- Consumes: Tasks 3–6 HTTP DTOs.
- Produces: typed web fetch methods, Wanted navigation, notification-event drawer integration, bell-preserving header, and Sell/Request chooser.

- [ ] **Step 1: Write failing client serialization tests**

```ts
it('serializes Wanted feed filters without undefined parameters', () => {
  expect(wantedFeedUrl({ q: 'desk', category: 'goods', budget: 80 })).toBe('/api/wanted?q=desk&category=goods&budget=80');
});
```

Add tests for create payload trimming and received/sent offer endpoint selection.

- [ ] **Step 2: Run RED and implement client module**

Run: `npm test -- src/lib/wanted-client.test.ts`

Expected: module missing. Implement typed methods and rerun PASS.

- [ ] **Step 3: Add web navigation**

Add Wanted beside Feed/Requests in authenticated navigation. Keep Notifications as the existing persistent drawer/bell; include Wanted unread attention in its accessible label without changing existing sale counts.

Fetch `/api/notification-events` with existing activity data, render Wanted events in the same notification drawer, and mark/dismiss them through PATCH without changing reveal-request dismissal behavior.

- [ ] **Step 4: Add post chooser**

Route the global post action to `/post/choose`. Render two accessible cards: Sell something routes to `/post`; Request something routes to `/wanted/post`. Preserve direct `/post` URLs.

- [ ] **Step 5: Verify and commit**

Run: `npm test && npm run lint && npx tsc --noEmit && npm run build`

```bash
git add src/lib/wanted-client.ts src/lib/wanted-client.test.ts src/lib/store.ts src/lib/store-context.tsx 'src/app/(app)/layout.tsx' src/components/WebApp.tsx 'src/app/(app)/post/page.tsx' 'src/app/(app)/post/choose/page.tsx'
git commit -m "feat(web): add Wanted navigation"
```

### Task 8: Build the complete web Wanted experience

**Files:**
- Create: `src/app/(app)/wanted/page.tsx`
- Create: `src/app/(app)/wanted/post/page.tsx`
- Create: `src/app/(app)/wanted/[id]/page.tsx`
- Create: `src/app/(app)/wanted/[id]/edit/page.tsx`
- Create: `src/components/WantedCard.tsx`
- Create: `src/components/WantedOfferForm.tsx`
- Create: `src/lib/wanted-presentation.ts`
- Create: `src/lib/wanted-presentation.test.ts`
- Modify: `src/app/(app)/requests/page.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: Task 7 client methods and existing profile/safety/location/photo components.
- Produces: searchable feed, create/detail/edit/delete, private offer form, and Requests → Wanted offers Received/Sent UI.

- [ ] **Step 1: Write failing presentation tests**

```ts
it('shows deadline and budget without exposing private offer data', () => {
  expect(wantedCardCopy({ max_budget: 80, needed_by: '2026-09-01T12:00:00Z', offer_count: 3 }, new Date('2026-08-25T12:00:00Z'))).toEqual({ budget: 'Up to $80', deadline: 'Needed by Sep 1', offers: '3 offers' });
});
```

Add literal tests for zero/one offer grammar, expired label, accepted/declined/pending offer labels, and required-field hints.

- [ ] **Step 2: Run RED and implement presentation helpers**

Run: `npm test -- src/lib/wanted-presentation.test.ts`

Expected: module missing, then PASS after focused helper implementation.

- [ ] **Step 3: Build feed and cards**

Implement debounced search, category/budget/location/deadline filters, cursor pagination, My Wanted filter, empty/loading/error states, and cards containing only public DTO fields.

- [ ] **Step 4: Build post/edit/detail**

Reuse place search and image upload patterns. Post form requires every approved field, allows up to six optional square reference photos, preserves data on error, and navigates to detail on success. Owner detail exposes edit/delete; stranger detail exposes Make an offer.

- [ ] **Step 5: Build private offer form and inbox**

Require photo, price, description, and message. Requests primary tabs become Conversations/Sale requests/Wanted offers; both request types have Received/Sent controls. Received pending offers expose Accept & open chat/Decline; sent pending offers expose Edit/Withdraw.

- [ ] **Step 6: Verify web behavior and commit**

Run:

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

```bash
git add 'src/app/(app)/wanted' src/components/WantedCard.tsx src/components/WantedOfferForm.tsx src/lib/wanted-presentation.ts src/lib/wanted-presentation.test.ts 'src/app/(app)/requests/page.tsx' src/app/globals.css
git commit -m "feat(web): add Wanted marketplace"
```

### Task 9: Add mobile Wanted client, navigation, and post chooser

**Files:**
- Create: `mobile/src/lib/wanted.ts`
- Create: `mobile/src/lib/wanted.test.ts`
- Modify: `mobile/src/app/(tabs)/_layout.tsx`
- Modify: `mobile/src/app/(tabs)/post.tsx`
- Create: `mobile/src/app/sell/post.tsx`
- Modify: `mobile/src/app/_layout.tsx`
- Modify: `mobile/src/app/(tabs)/notifications.tsx`
- Create: `mobile/src/components/HeaderNotificationButton.tsx`

**Interfaces:**
- Consumes: Tasks 3–6 APIs and mobile `requireToken`/`API_BASE` conventions.
- Produces: mobile Wanted DTO/client functions, five-item navigation, header notification bell, and Sell/Request chooser.

- [ ] **Step 1: Write failing mobile client tests**

```ts
it('sends an authenticated Wanted offer to the selected post', async () => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ wanted_offer: { id: 'o1' } }), { status: 201, headers: { 'content-type': 'application/json' } }));
  const result = await createWantedOffer('p1', validOffer, { getAccessToken: async () => 'token', fetcher, apiBase: 'https://flipd.test' });
  expect(result.id).toBe('o1');
  expect(fetcher).toHaveBeenCalledWith('https://flipd.test/api/wanted/p1/offers', expect.objectContaining({ method: 'POST' }));
});
```

Add tests for feed filter URLs, accept returning thread ID, and server error propagation.

- [ ] **Step 2: Run RED and implement mobile client**

Run: `npm test --prefix mobile -- src/lib/wanted.test.ts`

Expected: module missing, then PASS after implementation.

- [ ] **Step 3: Update navigation**

Bottom tabs become Home/Wanted/Post/Requests/Profile. Register Notifications as `href: null` rather than deleting the screen. Add `HeaderNotificationButton` with existing unread event dot to Home and Wanted headers.

Merge `/api/notification-events` into the existing Notifications list, route Wanted post/offer events to their detail or inbox destination, and preserve current reveal/popup notification rows and dismissal behavior.

- [ ] **Step 4: Add post chooser without breaking direct sale posting**

Replace `(tabs)/post.tsx` with the chooser itself so tapping the raised center tab immediately shows Sell something and Request something. Move the existing sale form unchanged to `/sell/post`; Sell routes there and Request routes to `/wanted/post`. Update every internal link that previously intended to open the sale form directly. `/post` now intentionally means the approved chooser.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npm test --prefix mobile
npm run lint --prefix mobile
npx tsc --noEmit -p mobile/tsconfig.json
```

```bash
git add mobile/src/lib/wanted.ts mobile/src/lib/wanted.test.ts 'mobile/src/app/(tabs)/_layout.tsx' 'mobile/src/app/(tabs)/post.tsx' 'mobile/src/app/(tabs)/notifications.tsx' mobile/src/app/sell/post.tsx mobile/src/app/_layout.tsx mobile/src/components/HeaderNotificationButton.tsx
git commit -m "feat(mobile): add Wanted navigation"
```

### Task 10: Build the complete mobile Wanted experience

**Files:**
- Create: `mobile/src/app/(tabs)/wanted.tsx`
- Create: `mobile/src/app/wanted/post.tsx`
- Create: `mobile/src/app/wanted/[id]/index.tsx`
- Create: `mobile/src/app/wanted/[id]/edit.tsx`
- Create: `mobile/src/app/wanted/[id]/offer.tsx`
- Create: `mobile/src/components/WantedCard.tsx`
- Create: `mobile/src/components/WantedOfferRow.tsx`
- Create: `mobile/src/lib/wantedPresentation.ts`
- Create: `mobile/src/lib/wantedPresentation.test.ts`
- Modify: `mobile/src/app/(tabs)/requests.tsx`
- Modify: `mobile/src/lib/messages.ts`
- Modify: `mobile/src/app/messages/[id].tsx`

**Interfaces:**
- Consumes: Task 9 client functions, existing Field/FormScroll/photo/place/sheet patterns, generalized thread DTOs.
- Produces: all approved Wanted screens, offer inbox controls, and Wanted chat headers.

- [ ] **Step 1: Write failing presentation tests**

Port the literal web presentation cases to mobile and add `wantedActionState` cases proving owners cannot offer, expired posts cannot accept offers, pending sent offers can edit/withdraw, and accepted offers return Open chat.

- [ ] **Step 2: Run RED and implement helpers**

Run: `npm test --prefix mobile -- src/lib/wantedPresentation.test.ts`

Expected: missing module fails; helper implementation makes focused tests pass.

- [ ] **Step 3: Build Wanted feed and owner history**

Use FlatList with search/filter sheets, pull-to-refresh, cursor loading, public cards, My Wanted filter, skeletons, accessible controls, and the header notification bell.

- [ ] **Step 4: Build post/edit/detail/offer screens**

Use `Field` so placeholders/caret retain the fixed focus behavior. Reuse square crop photo handling and campus place search. Preserve form state on API failure. Confirm post deletion in an in-app Sheet and explain pending offers close while accepted chat remains.

- [ ] **Step 5: Restructure Requests and wire actions**

Primary tabs: Conversations/Sale requests/Wanted offers. Secondary Received/Sent segmented control appears for the latter two. Accept returns a thread ID and navigates to `/messages/<id>`; decline/edit/withdraw refresh both lists and badges.

- [ ] **Step 6: Generalize mobile thread UI**

Extend `ThreadSummary`/`ThreadHead` with `source_type`, nullable `request_id`, nullable `wanted_offer_id`, normalized title/price/photo, and transaction action metadata. Render Wanted title and accepted offer price without sale-listing assumptions.

- [ ] **Step 7: Verify and commit**

Run:

```bash
npm test --prefix mobile
npm run lint --prefix mobile
npx tsc --noEmit -p mobile/tsconfig.json
npx expo export --platform ios --output-dir /tmp/flipd-wanted-export
```

Expected: tests, lint, typecheck, and iOS export exit 0.

```bash
git add 'mobile/src/app/(tabs)/wanted.tsx' mobile/src/app/wanted mobile/src/components/WantedCard.tsx mobile/src/components/WantedOfferRow.tsx mobile/src/lib/wantedPresentation.ts mobile/src/lib/wantedPresentation.test.ts 'mobile/src/app/(tabs)/requests.tsx' mobile/src/lib/messages.ts 'mobile/src/app/messages/[id].tsx'
git commit -m "feat(mobile): add Wanted marketplace"
```

### Task 11: Add end-to-end authorization, cleanup, and regression coverage

**Files:**
- Create: `src/lib/wanted-authorization.test.ts`
- Modify: `src/lib/safety.ts`
- Modify: `src/app/api/safety/route.ts`
- Modify: `src/app/api/me/delete/route.ts`
- Modify: `mobile/src/lib/unread.tsx`
- Modify: `src/lib/store.ts`
- Create: `supabase/seeds/screenshot_wanted.sql`

**Interfaces:**
- Consumes: completed backend and clients.
- Produces: explicit cross-role regression matrix, trust/unread integration, storage cleanup, repeatable screenshot fixtures.

- [ ] **Step 1: Write the authorization matrix test first**

Use table-driven literal cases for owner, seller, stranger, same-direction block, reverse-direction block, expired, deleted, fulfilled, and competing accepted offer. Assert permissions for view public post, view private offer, submit, edit, withdraw, decline, accept, complete, rate, and report.

- [ ] **Step 2: Run RED and centralize authorization decisions**

Run: `npm test -- src/lib/wanted-authorization.test.ts`

Expected: missing centralized authorization export. Implement pure guards used by routes; rerun PASS.

- [ ] **Step 3: Integrate trust and unread counts**

Safety summaries count completed Wanted transactions and ratings without changing rating anonymity. Web/mobile unread counts add pending received Wanted offers and new offer events, but accepted offers represented by an unread chat are not double-counted.

- [ ] **Step 4: Verify account and media cleanup**

The delete-account route lists and removes Wanted reference and private offer storage objects before calling database cleanup. Add failure-safe logging and ensure the auth identity is not removed when required storage/database cleanup fails.

- [ ] **Step 5: Add repeatable screenshot seed**

Create fixed UUID fixtures for three public Wanted posts, two received offers, two sent offers, and one accepted Wanted conversation. Resolve the viewer by replaceable email, use upserts, and include a commented cleanup transaction. Never execute it automatically in tests.

- [ ] **Step 6: Run complete regression suite and commit**

Run:

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
npm test --prefix mobile
npm run lint --prefix mobile
npx tsc --noEmit -p mobile/tsconfig.json
git diff --check
```

```bash
git add src/lib/wanted-authorization.test.ts src/lib/safety.ts src/app/api/safety/route.ts src/app/api/me/delete/route.ts mobile/src/lib/unread.tsx src/lib/store.ts supabase/seeds/screenshot_wanted.sql
git commit -m "test(wanted): cover full transaction flow"
```

### Task 12: Deploy additively, verify production, and prepare Build 8+

**Files:**
- Modify only if verification exposes a defect; every fix requires a new failing regression test in its owning task area.
- Read: `mobile/eas.json`, `mobile/app.json`, `mobile/store/*`

**Interfaces:**
- Consumes: Tasks 1–11 and production Supabase/EAS/Vercel configuration.
- Produces: verified migrations/backend, activated web/mobile UI, production screenshot data on explicit account, and TestFlight build.

- [ ] **Step 1: Verify a clean worktree and full local release gate**

Run:

```bash
git status --short --branch
npm test && npm run lint && npx tsc --noEmit && npm run build
npm test --prefix mobile && npm run lint --prefix mobile
npx tsc --noEmit -p mobile/tsconfig.json
npm run store:validate --prefix mobile
npx expo-doctor@latest mobile
npx expo export --platform ios --output-dir /tmp/flipd-wanted-release
git diff --check
```

Expected: clean branch except intended commits; all commands exit 0; Expo Doctor reports 18/18.

- [ ] **Step 2: Apply migrations 039–042 in order**

Use the linked production Supabase project. Record migration versions, then query constraints/indexes/functions/policies to confirm each exists. Do not activate client navigation yet.

- [ ] **Step 3: Deploy backend and run API smoke matrix**

Verify authenticated create/read/edit/delete post; seller offer submit/edit/withdraw; buyer decline; atomic accept; competing decline; thread messaging; completion; rating; report; block denial; effective expiry; and account cleanup using disposable test rows with fixed IDs.

- [ ] **Step 4: Activate and verify web**

Enable Wanted navigation, then test desktop and mobile-width web layouts. Confirm existing sale posting, requests, notifications, messages, ratings, and deletion still work.

- [ ] **Step 5: Seed screenshot account intentionally**

Replace the email placeholder in `supabase/seeds/screenshot_wanted.sql` with the confirmed TestFlight account, execute once, and verify expected counts by fixed IDs. Do not modify unrelated production rows.

- [ ] **Step 6: Commit any release-flag activation and push**

```bash
git status --short
git push origin flipd-v1
```

Expected: remote contains all reviewed atomic commits and production deploy succeeds.

- [ ] **Step 7: Start iOS production build with auto-submit**

```bash
cd mobile
npx eas-cli build --platform ios --profile production --auto-submit --non-interactive
```

Record build ID, submission ID, build number, commit hash, build logs, and App Store Connect URL. Wait for EAS success and separately confirm Apple processing/Ready to Test before claiming TestFlight availability.

- [ ] **Step 8: Final handoff**

Report implemented flows, verification counts, migration state, seeded account, commit range, web deployment state, TestFlight build/submission state, and direct links. List only real remaining App Store Connect actions.
