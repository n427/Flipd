# Flipd Full Functionality & Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take Flipd from a mocked demo to a fully functional @usc.edu-verified marketplace (auth, profiles, real feed, reveal-contact flow, RLS) with an "A1 clean market" app restyle and a "P1 pure Apple" marketing page rebuild.

**Architecture:** Next.js 14 App Router + Supabase. All reads/writes go through Next API routes; routes authenticate via the Supabase session cookie (`@supabase/ssr`) and perform DB work with the service-role client, enforcing ownership in code. RLS is enabled on every table as a backstop. The client store (`useFlipdStore`) hydrates from the API routes only — the browser never talks to Supabase directly.

**Tech Stack:** Next.js 14.2, React 18, TypeScript, Supabase (Auth magic link, Postgres, Storage), `@supabase/ssr`, `@supabase/supabase-js`, Vitest (unit tests for pure logic), next/font (Inter).

**Spec:** `docs/superpowers/specs/2026-07-16-flipd-full-functionality-and-restyle-design.md`

## Global Constraints

- Product name in all UI/copy: **Flipd** (wordmark lowercase `flipd` + cardinal dot). Never "Tassel".
- **No emojis anywhere** in UI — SVG line icons only (existing `Icon.tsx`, extended as needed).
- Typography: **Inter everywhere** — no serif, no Georgia. (The `--serif`/`--mono` CSS vars already alias to Inter; final token cleanup removes them.)
- App palette (A1 clean market): `--bg #fff`, `--ink #111`, `--ink-2 #333`, `--muted #98a0a8`, `--surface #f2f3f5`, `--accent #990000` (cardinal only for prices, CTAs, wordmark dot, badges). No gold, no cream in the app.
- Auth: magic-link only, addresses must end `@usc.edu` (case-insensitive), enforced server-side.
- DB access: API routes only. Service-role key never leaves the server. RLS enabled on every public table.
- Migrations: write SQL to `supabase/migrations/NNN_name.sql` in-repo, apply via Supabase MCP `apply_migration` (project already connected; tables `listings`/`saves` exist with **0 rows** — destructive alters are safe).
- Commit after every task. Run `npx tsc --noEmit` before each commit (there is no test script for API routes; Vitest covers pure logic).
- Env vars already present in `.env.local`: `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Dev server: `npm run dev` on http://localhost:3000 (Supabase Site URL default allows this redirect).

---

## Phase 1 — Toolchain + pure-logic foundation

### Task 1: Vitest setup + shared validation/status helpers

**Files:**
- Create: `src/lib/validation.ts`
- Create: `src/lib/validation.test.ts`
- Create: `vitest.config.ts`
- Modify: `package.json` (add deps + `test` script)

**Interfaces:**
- Produces: `isUscEmail(email: string): boolean`; `effectiveRevealStatus(status: RevealStatus, expiresAt: string, now?: Date): RevealStatus`; `RevealStatus = 'pending' | 'approved' | 'declined' | 'expired'`. Used by Tasks 5, 8, 9, 13.

- [ ] **Step 1: Install dependencies**

```bash
npm install @supabase/ssr && npm install -D vitest
```

- [ ] **Step 2: Add test script and vitest config**

In `package.json` scripts, add `"test": "vitest run"`.

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 3: Write the failing test**

Create `src/lib/validation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { effectiveRevealStatus, isUscEmail } from './validation';

describe('isUscEmail', () => {
  it('accepts usc.edu addresses case-insensitively', () => {
    expect(isUscEmail('trojan@usc.edu')).toBe(true);
    expect(isUscEmail('Trojan@USC.EDU')).toBe(true);
    expect(isUscEmail('  trojan@usc.edu  ')).toBe(true);
  });
  it('rejects other domains and malformed input', () => {
    expect(isUscEmail('trojan@gmail.com')).toBe(false);
    expect(isUscEmail('trojan@notusc.edu')).toBe(false);
    expect(isUscEmail('@usc.edu')).toBe(false);
    expect(isUscEmail('')).toBe(false);
  });
});

describe('effectiveRevealStatus', () => {
  const now = new Date('2026-07-16T12:00:00Z');
  it('expires pending requests past expires_at', () => {
    expect(effectiveRevealStatus('pending', '2026-07-16T11:00:00Z', now)).toBe('expired');
  });
  it('keeps pending requests before expires_at', () => {
    expect(effectiveRevealStatus('pending', '2026-07-16T13:00:00Z', now)).toBe('pending');
  });
  it('never changes resolved statuses', () => {
    expect(effectiveRevealStatus('approved', '2026-07-16T11:00:00Z', now)).toBe('approved');
    expect(effectiveRevealStatus('declined', '2026-07-16T11:00:00Z', now)).toBe('declined');
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run`
Expected: FAIL — cannot resolve `./validation`.

- [ ] **Step 5: Write the implementation**

Create `src/lib/validation.ts`:

```ts
// Pure helpers shared by API routes and the client store. No imports — keep
// this file dependency-free so it stays trivially unit-testable.

export type RevealStatus = 'pending' | 'approved' | 'declined' | 'expired';

export function isUscEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  return /^[^\s@]+@usc\.edu$/.test(e);
}

// 72h expiry is computed at read time — a pending request past its
// expires_at is treated as expired everywhere (no cron).
export function effectiveRevealStatus(
  status: RevealStatus,
  expiresAt: string,
  now: Date = new Date(),
): RevealStatus {
  if (status === 'pending' && new Date(expiresAt).getTime() < now.getTime()) return 'expired';
  return status;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run`
Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/validation.ts src/lib/validation.test.ts
git commit -m "feat: add vitest + usc-email/reveal-status helpers"
```

---

## Phase 2 — Database migrations (Supabase MCP)

### Task 2: Schema — profiles, listings.seller_id, saves, reveal_requests, RLS, seed

**Files:**
- Create: `supabase/migrations/001_profiles.sql`
- Create: `supabase/migrations/002_listings_seller_fk.sql`
- Create: `supabase/migrations/003_saves_per_user.sql`
- Create: `supabase/migrations/004_reveal_requests.sql`
- Create: `supabase/migrations/005_rls.sql`
- Create: `supabase/migrations/006_seed_demo.sql`

**Interfaces:**
- Produces: tables `profiles`, `listings` (seller_id uuid FK), `saves` (user_id, listing_id PK), `reveal_requests`; trigger auto-creating a profile row on auth signup; demo profile id `d0000000-0000-4000-8000-000000000001`. Consumed by every API task.
- Note on RLS: the spec's intent is a backstop. RLS cannot hide columns, so `profiles` (contains contact info) and `saves`/`reveal_requests` get **no policies at all** (deny by default — API routes use service role which bypasses RLS). `listings` gets an authenticated read policy for non-archived rows. This is stricter than the spec's wording and satisfies its intent.

- [ ] **Step 1: Write migration 001 (profiles + signup trigger)**

Create `supabase/migrations/001_profiles.sql`:

```sql
-- One row per user. id matches auth.users.id for real users; the demo
-- profile is a standalone row (no auth user), so there is deliberately
-- NO foreign key to auth.users.
create table public.profiles (
  id uuid primary key,
  display_name text,
  handle text unique,
  school_unit text,
  class_year text,
  contact_instagram text,
  contact_phone text,
  contact_email text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

-- Auto-create a profile stub on signup; onboarding fills the rest.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, contact_email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

- [ ] **Step 2: Write migration 002 (listings seller FK)**

Create `supabase/migrations/002_listings_seller_fk.sql`:

```sql
-- Table has 0 rows; drop-and-replace the text seller_id safely.
alter table public.listings drop column seller_id;
alter table public.listings
  add column seller_id uuid not null references public.profiles (id);
create index listings_seller_id_idx on public.listings (seller_id);
create index listings_feed_idx on public.listings (archived, created_at desc);
```

- [ ] **Step 3: Write migration 003 (saves per user)**

Create `supabase/migrations/003_saves_per_user.sql`:

```sql
alter table public.saves drop constraint saves_pkey;
alter table public.saves
  add column user_id uuid not null references public.profiles (id);
alter table public.saves add primary key (user_id, listing_id);
```

- [ ] **Step 4: Write migration 004 (reveal_requests)**

Create `supabase/migrations/004_reveal_requests.sql`:

```sql
create table public.reveal_requests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  buyer_id uuid not null references public.profiles (id),
  seller_id uuid not null references public.profiles (id),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '72 hours',
  resolved_at timestamptz
);

-- One live (pending/approved) request per buyer per listing.
create unique index reveal_requests_live_uniq
  on public.reveal_requests (listing_id, buyer_id)
  where status in ('pending', 'approved');

create index reveal_requests_seller_idx on public.reveal_requests (seller_id, status);
create index reveal_requests_buyer_idx on public.reveal_requests (buyer_id);
```

- [ ] **Step 5: Write migration 005 (RLS)**

Create `supabase/migrations/005_rls.sql`:

```sql
-- Backstop only: the app reads/writes through server API routes using the
-- service role (bypasses RLS). Deny-by-default for the anon/authenticated
-- keys; the single read policy lets nothing sensitive out.
alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.saves enable row level security;
alter table public.reveal_requests enable row level security;

create policy "listings_read_active" on public.listings
  for select to authenticated using (archived = false);
```

- [ ] **Step 6: Write migration 006 (seed demo profile + 12 listings)**

Create `supabase/migrations/006_seed_demo.sql`:

```sql
insert into public.profiles (id, display_name, handle, school_unit, class_year, is_demo, contact_email)
values ('d0000000-0000-4000-8000-000000000001', 'Flipd Team', 'flipd.team', 'Flipd', '', true, null);

insert into public.listings (seller_id, category, title, description, price, negotiable, location, contact, photo_urls, photo_focus)
values
  ('d0000000-0000-4000-8000-000000000001', 'food', 'Sourdough loaves — Sunday pickup', 'Fresh small-batch sourdough baked Saturday night. Pickup Sunday 10–2 near 30th & Hoover.', 12, false, '30th & Hoover', '{email}', '{https://picsum.photos/seed/flipd-bread/800/800}', '{50% 50%}'),
  ('d0000000-0000-4000-8000-000000000001', 'services', 'Press-on nails, custom sets', 'Custom press-on sets, sized to your nails. 48h turnaround, pickup in Cardinal Gardens.', 35, true, 'Cardinal Gardens', '{email}', '{https://picsum.photos/seed/flipd-nails/800/800}', '{50% 50%}'),
  ('d0000000-0000-4000-8000-000000000001', 'event', 'Trousdale Block Party — Friday', 'Free block party on Trousdale, Friday 7–11pm. Music, food stands, club tables.', 0, false, 'Trousdale Pkwy', '{email}', '{https://picsum.photos/seed/flipd-party/800/800}', '{50% 50%}'),
  ('d0000000-0000-4000-8000-000000000001', 'goods', 'IKEA Markus chair, barely used', 'Office chair in great shape, no stains or squeaks. Pickup only at USC Village.', 90, true, 'USC Village', '{email}', '{https://picsum.photos/seed/flipd-chair/800/800}', '{50% 50%}'),
  ('d0000000-0000-4000-8000-000000000001', 'housing', 'Summer sublet — 1bd in The Lorenzo', 'June 1 – Aug 15, furnished 1bd, utilities included. Pool + gym access.', 1450, true, 'The Lorenzo', '{email}', '{https://picsum.photos/seed/flipd-apt/800/800}', '{50% 50%}'),
  ('d0000000-0000-4000-8000-000000000001', 'services', 'GMAT tutoring — 720+ scorer', 'One-on-one GMAT prep, in person at Marshall or over Zoom. First session half price.', 60, false, 'Marshall / Zoom', '{email}', '{https://picsum.photos/seed/flipd-tutor/800/800}', '{50% 50%}'),
  ('d0000000-0000-4000-8000-000000000001', 'food', 'Birria tacos — pre-order by Thursday', 'Weekend birria plates: 3 tacos + consomé. Order by Thursday night, Saturday pickup.', 14, false, 'North University Park', '{email}', '{https://picsum.photos/seed/flipd-tacos/800/800}', '{50% 50%}'),
  ('d0000000-0000-4000-8000-000000000001', 'goods', 'BUAD 304 textbook + study guide', 'Textbook plus my annotated study guide. Doheny pickup or DPS dropoff.', 25, false, 'Doheny Library', '{email}', '{https://picsum.photos/seed/flipd-book/800/800}', '{50% 50%}'),
  ('d0000000-0000-4000-8000-000000000001', 'event', 'Latinx Honors Mixer @ Tutor', 'Networking mixer Thursday 6pm at Tutor Campus Center. $5 at the door.', 5, false, 'Tutor Campus Center', '{email}', '{https://picsum.photos/seed/flipd-mixer/800/800}', '{50% 50%}'),
  ('d0000000-0000-4000-8000-000000000001', 'services', 'Senior portrait shoots — grad season', '1hr on-campus session, 30 edited photos back within a week.', 120, false, 'On campus', '{email}', '{https://picsum.photos/seed/flipd-photo/800/800}', '{50% 50%}'),
  ('d0000000-0000-4000-8000-000000000001', 'goods', 'Single-speed bike, 56cm', 'Rides smooth, new tires this spring. Some cosmetic scratches. Negotiable.', 180, true, 'Adams & Vermont', '{email}', '{https://picsum.photos/seed/flipd-bike/800/800}', '{50% 50%}'),
  ('d0000000-0000-4000-8000-000000000001', 'food', 'Matcha drinks — Tue & Thu', 'Iced matcha lattes outside Leavey, Tuesdays and Thursdays 10–2. Oat milk available.', 7, false, 'Outside Leavey', '{email}', '{https://picsum.photos/seed/flipd-matcha/800/800}', '{50% 50%}');
```

- [ ] **Step 7: Apply all six migrations via Supabase MCP**

Call `mcp__supabase__apply_migration` six times, in order, with `name` = the file's basename (e.g. `001_profiles`) and `query` = the exact file contents.

- [ ] **Step 8: Verify schema and seed**

Call `mcp__supabase__execute_sql` with:

```sql
select (select count(*) from public.profiles where is_demo) as demo_profiles,
       (select count(*) from public.listings) as listings,
       (select count(*) from pg_policies where schemaname = 'public') as policies;
```

Expected: `demo_profiles = 1`, `listings = 12`, `policies = 1`.

Then call `mcp__supabase__get_advisors` with type `security`.
Expected: the "RLS disabled" critical advisory is gone (an "RLS enabled, no policy" INFO-level notice for profiles/saves/reveal_requests is acceptable — deny-all is intentional).

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations
git commit -m "feat: schema for profiles, per-user saves, reveal requests, RLS + demo seed"
```

---

## Phase 3 — Auth plumbing

### Task 3: Supabase client split (admin vs session)

**Files:**
- Create: `src/lib/supabase/admin.ts`
- Create: `src/lib/supabase/server.ts`
- Delete: `src/lib/supabase.ts`
- Modify: `src/app/api/listings/route.ts:2`, `src/app/api/listings/[id]/route.ts:2`, `src/app/api/saves/route.ts:2` (imports only in this task)

**Interfaces:**
- Produces: `admin` (service-role `SupabaseClient`) from `@/lib/supabase/admin`; `createSessionClient(): SupabaseClient` and `getSessionUser(): Promise<{ id: string; email: string } | null>` from `@/lib/supabase/server`. Consumed by Tasks 4–8.

- [ ] **Step 1: Create the admin client**

Create `src/lib/supabase/admin.ts`:

```ts
import { createClient } from '@supabase/supabase-js';

// Service-role client — server only. Bypasses RLS; every route using it must
// enforce ownership itself.
export const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);
```

- [ ] **Step 2: Create the session client + helper**

Create `src/lib/supabase/server.ts`:

```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Anon-key client bound to the request's auth cookies. Used only to read the
// caller's identity and run the auth flows — data access goes through admin.
export function createSessionClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );
}

export async function getSessionUser(): Promise<{ id: string; email: string } | null> {
  const supabase = createSessionClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? '' };
}
```

- [ ] **Step 3: Repoint existing imports and delete the old client**

In `src/app/api/listings/route.ts`, `src/app/api/listings/[id]/route.ts`, and `src/app/api/saves/route.ts`, replace:

```ts
import { supabase } from '@/lib/supabase';
```

with:

```ts
import { admin as supabase } from '@/lib/supabase/admin';
```

Delete `src/lib/supabase.ts`.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: split supabase clients into admin + session"
```

### Task 4: Sign-in, callback, sign-out, route protection

**Files:**
- Create: `src/app/api/auth/signin/route.ts`
- Create: `src/app/api/auth/signout/route.ts`
- Create: `src/app/auth/callback/route.ts`
- Create: `src/middleware.ts`

**Interfaces:**
- Consumes: `isUscEmail` (Task 1), `createSessionClient` (Task 3).
- Produces: `POST /api/auth/signin` body `{ email: string }` → 200 `{ ok: true }` | 400 `{ error }`; `POST /api/auth/signout` → 200; `GET /auth/callback?code=…` → redirect `/feed` or `/onboarding`. Middleware redirects unauthenticated visits to `/feed|/post|/profile|/listing/*|/onboarding` → `/`.

- [ ] **Step 1: Sign-in route**

Create `src/app/api/auth/signin/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createSessionClient } from '@/lib/supabase/server';
import { isUscEmail } from '@/lib/validation';

export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({}));
  if (typeof email !== 'string' || !isUscEmail(email)) {
    return NextResponse.json(
      { error: 'Flipd is USC-only for now — enter your @usc.edu address.' },
      { status: 400 },
    );
  }
  const supabase = createSessionClient();
  const origin = req.nextUrl.origin;
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Callback route**

Create `src/app/auth/callback/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createSessionClient } from '@/lib/supabase/server';
import { admin } from '@/lib/supabase/admin';

// Magic-link landing: exchange the code for a session cookie, then route to
// onboarding until the profile has a display name.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const origin = req.nextUrl.origin;
  if (!code) return NextResponse.redirect(`${origin}/?auth=error`);

  const supabase = createSessionClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return NextResponse.redirect(`${origin}/?auth=error`);

  const { data: profile } = await admin
    .from('profiles')
    .select('display_name')
    .eq('id', data.user.id)
    .single();

  return NextResponse.redirect(
    profile?.display_name ? `${origin}/feed` : `${origin}/onboarding`,
  );
}
```

- [ ] **Step 3: Sign-out route**

Create `src/app/api/auth/signout/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createSessionClient } from '@/lib/supabase/server';

export async function POST() {
  const supabase = createSessionClient();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Middleware**

Create `src/middleware.ts`:

```ts
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

const PROTECTED = ['/feed', '/post', '/profile', '/listing', '/onboarding'];

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options),
          );
        },
      },
    },
  );
  const { data } = await supabase.auth.getUser();

  const path = req.nextUrl.pathname;
  if (!data.user && PROTECTED.some((p) => path === p || path.startsWith(p + '/'))) {
    return NextResponse.redirect(new URL('/', req.url));
  }
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
};
```

- [ ] **Step 5: Verify redirect + sign-in validation**

Run: `npm run dev &` then:

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/feed
curl -s -X POST http://localhost:3000/api/auth/signin -H 'Content-Type: application/json' -d '{"email":"x@gmail.com"}'
```

Expected: first prints `307 http://localhost:3000/` (redirect to landing); second prints the USC-only error JSON with status 400.

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/app/api/auth src/app/auth src/middleware.ts
git commit -m "feat: magic-link auth (usc.edu only), callback, signout, route protection"
```

### Task 5: `/api/me` + onboarding page

**Files:**
- Create: `src/app/api/me/route.ts`
- Create: `src/app/onboarding/page.tsx`

**Interfaces:**
- Consumes: `getSessionUser`, `admin` (Task 3).
- Produces: `GET /api/me` → `{ profile: Profile | null }` (401 if signed out); `PATCH /api/me` body `{ display_name, handle, school_unit, class_year, contact_instagram, contact_phone, contact_email }` (all optional strings) → `{ profile }`. `Profile` row type: `{ id: string; display_name: string | null; handle: string | null; school_unit: string | null; class_year: string | null; contact_instagram: string | null; contact_phone: string | null; contact_email: string | null; is_demo: boolean; created_at: string }`. Consumed by Tasks 9, 11.

- [ ] **Step 1: Me route**

Create `src/app/api/me/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data } = await admin.from('profiles').select('*').eq('id', user.id).single();
  return NextResponse.json({ profile: data ?? null });
}

const EDITABLE = [
  'display_name', 'handle', 'school_unit', 'class_year',
  'contact_instagram', 'contact_phone', 'contact_email',
] as const;

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));

  const update: Record<string, string | null> = {};
  for (const key of EDITABLE) {
    if (typeof body[key] === 'string') update[key] = body[key].trim() || null;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }
  const { data, error } = await admin
    .from('profiles')
    .update(update)
    .eq('id', user.id)
    .select()
    .single();
  if (error) {
    const msg = error.code === '23505' ? 'That handle is taken.' : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ profile: data });
}
```

- [ ] **Step 2: Onboarding page**

Create `src/app/onboarding/page.tsx` (already in the final A1 style — white, Inter, cardinal CTA):

```tsx
'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

const UNITS = ['Marshall', 'Annenberg', 'Viterbi', 'Dornsife', 'SCA', 'Roski', 'Thornton', 'Price', 'Other'];

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = React.useState('');
  const [handle, setHandle] = React.useState('');
  const [unit, setUnit] = React.useState('');
  const [year, setYear] = React.useState('');
  const [instagram, setInstagram] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Your name is required.'); return; }
    setSaving(true);
    setError('');
    const res = await fetch('/api/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        display_name: name, handle, school_unit: unit, class_year: year,
        contact_instagram: instagram, contact_phone: phone,
      }),
    });
    if (res.ok) { router.push('/feed'); return; }
    const body = await res.json().catch(() => ({}));
    setError(body.error || 'Could not save — try again.');
    setSaving(false);
  };

  return (
    <div style={{ maxWidth: 440, margin: '0 auto', padding: '72px 24px' }}>
      <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.04em', color: 'var(--ink)' }}>
        flipd<span style={{ color: 'var(--accent)' }}>.</span>
      </div>
      <h1 style={{ fontWeight: 800, fontSize: 28, letterSpacing: '-0.03em', color: 'var(--ink)', margin: '28px 0 6px' }}>
        Set up your profile
      </h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 28px' }}>
        This is what buyers and sellers see when you connect.
      </p>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <input className="field" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="field" placeholder="Handle (optional, e.g. alex.sc)" value={handle} onChange={(e) => setHandle(e.target.value)} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <select className="field" value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="">School</option>
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <input className="field" placeholder="Class year (e.g. 2027)" value={year} onChange={(e) => setYear(e.target.value)} />
        </div>
        <input className="field" placeholder="Instagram (optional, e.g. @alex.sc)" value={instagram} onChange={(e) => setInstagram(e.target.value)} />
        <input className="field" placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        {error && <div style={{ fontSize: 13, color: 'var(--accent)' }}>{error}</div>}
        <button type="submit" className="btn btn-primary" disabled={saving} style={{ padding: '13px 22px' }}>
          {saving ? 'Saving…' : 'Enter Flipd'}
        </button>
      </form>
    </div>
  );
}
```

Note: `--accent` is defined in Task 10; until then it renders with the fallback inherited value — acceptable, or use `var(--cardinal)` and Task 10's alias keeps it working. Use `var(--cardinal)` in this file if Task 10 has not landed yet — Task 10 keeps `--cardinal` as an alias so both resolve.

- [ ] **Step 3: Verify + commit**

Run: `npx tsc --noEmit` — expected: clean.

```bash
git add src/app/api/me src/app/onboarding
git commit -m "feat: profile me endpoint + onboarding screen"
```

---

## Phase 4 — Feature APIs + store rewrite

### Task 6: Listings API — real sellers, auth, ownership

**Files:**
- Modify: `src/app/api/listings/route.ts`
- Modify: `src/app/api/listings/[id]/route.ts`

**Interfaces:**
- Consumes: `getSessionUser`, `admin`.
- Produces: every listing row in responses now includes `seller: { id, display_name, handle, school_unit, class_year, is_demo }` (joined). `GET /api/listings?category&q&mine=1&include_archived=1` (401 signed-out); `POST /api/listings` (multipart, as today, seller from session); `PATCH /api/listings/[id]` `{ archived }` (403 unless owner). Consumed by Task 9.

- [ ] **Step 1: Rewrite `src/app/api/listings/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { admin as supabase } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';

const SELLER_JOIN = '*, seller:profiles!listings_seller_id_fkey(id, display_name, handle, school_unit, class_year, is_demo)';

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');
  const q = searchParams.get('q');
  const mine = searchParams.get('mine') === '1';
  const includeArchived = searchParams.get('include_archived') === '1';

  let query = supabase
    .from('listings')
    .select(SELLER_JOIN)
    .order('created_at', { ascending: false });

  if (mine) query = query.eq('seller_id', user.id);
  if (!includeArchived) query = query.eq('archived', false);
  if (category && category !== 'all') query = query.eq('category', category);
  if (q) query = query.ilike('title', `%${q}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ listings: data });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const category = formData.get('category') as string;
  const title = formData.get('title') as string;
  const description = formData.get('description') as string | null;
  const price = parseInt((formData.get('price') as string) || '0', 10);
  const negotiable = formData.get('negotiable') === 'true';
  const location = formData.get('location') as string | null;
  const contact = JSON.parse((formData.get('contact') as string) || '[]') as string[];
  const photoFocusRaw = formData.getAll('photo_focus') as string[];
  const photoFiles = formData.getAll('photos') as File[];

  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });
  if (photoFiles.length === 0) {
    return NextResponse.json({ error: 'at least one photo required' }, { status: 400 });
  }

  const listingId = crypto.randomUUID();
  const photoUrls: string[] = [];
  for (let i = 0; i < photoFiles.length; i++) {
    const file = photoFiles[i];
    const buffer = Buffer.from(await file.arrayBuffer());
    const extMatch = /\.([a-zA-Z0-9]+)$/.exec(file.name);
    const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
    const path = `${listingId}/photo-${i}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('listing-photos')
      .upload(path, buffer, { contentType: file.type, upsert: true });
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });
    const { data: urlData } = supabase.storage.from('listing-photos').getPublicUrl(path);
    photoUrls.push(urlData.publicUrl);
  }

  const focusArr = photoFiles.map((_, i) => photoFocusRaw[i] || '50% 50%');

  const { data, error } = await supabase
    .from('listings')
    .insert({
      id: listingId,
      seller_id: user.id,
      category,
      title,
      description: description || null,
      price: isNaN(price) ? 0 : price,
      negotiable,
      location: location || null,
      contact,
      photo_urls: photoUrls,
      photo_focus: focusArr,
    })
    .select(SELLER_JOIN)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ listing: data }, { status: 201 });
}
```

- [ ] **Step 2: Rewrite `src/app/api/listings/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { admin as supabase } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';

const SELLER_JOIN = '*, seller:profiles!listings_seller_id_fkey(id, display_name, handle, school_unit, class_year, is_demo)';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('listings')
    .select(SELLER_JOIN)
    .eq('id', params.id)
    .single();

  if (error || !data) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ listing: data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (typeof body.archived !== 'boolean') {
    return NextResponse.json({ error: 'archived (boolean) required' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('listings')
    .select('seller_id')
    .eq('id', params.id)
    .single();
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (existing.seller_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('listings')
    .update({ archived: body.archived })
    .eq('id', params.id)
    .select(SELLER_JOIN)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'not found' }, { status: 404 });
  }
  return NextResponse.json({ listing: data });
}
```

- [ ] **Step 3: Verify unauthenticated is rejected**

With dev server running:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/listings
```

Expected: `401`.

- [ ] **Step 4: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/app/api/listings
git commit -m "feat: listings API — session auth, seller join, ownership checks"
```

### Task 7: Saves API — per user

**Files:**
- Modify: `src/app/api/saves/route.ts`

**Interfaces:**
- Consumes: `getSessionUser`, `admin`.
- Produces: `GET /api/saves` → `{ ids: string[] }` for the session user; `POST`/`DELETE /api/saves` body `{ listing_id }`. All 401 signed-out. Consumed by Task 9.

- [ ] **Step 1: Rewrite `src/app/api/saves/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { admin as supabase } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data, error } = await supabase
    .from('saves')
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
  const { error } = await supabase.from('saves').upsert({ user_id: user.id, listing_id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { listing_id } = await req.json().catch(() => ({}));
  if (!listing_id) return NextResponse.json({ error: 'listing_id required' }, { status: 400 });
  const { error } = await supabase
    .from('saves')
    .delete()
    .eq('user_id', user.id)
    .eq('listing_id', listing_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/app/api/saves
git commit -m "feat: per-user saves"
```

### Task 8: Reveal requests API

**Files:**
- Create: `src/app/api/reveals/route.ts`
- Create: `src/app/api/reveals/[id]/route.ts`

**Interfaces:**
- Consumes: `getSessionUser`, `admin`, `effectiveRevealStatus` (Task 1).
- Produces:
  - `GET /api/reveals` → `{ incoming: RevealDto[], outgoing: RevealDto[] }` where `RevealDto = { id, listing_id, listing_title, status, created_at, expires_at, counterpart: { id, display_name, school_unit, class_year }, contact?: { instagram?: string, phone?: string, email?: string } }` (`contact` only on approved outgoing).
  - `POST /api/reveals` `{ listing_id }` → 201 `{ reveal }` | 400/404/409.
  - `PATCH /api/reveals/[id]` `{ action: 'approve' | 'decline' }` → `{ reveal }` (403 unless seller; 409 unless pending).
  Consumed by Task 9.

- [ ] **Step 1: Create `src/app/api/reveals/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';
import { effectiveRevealStatus, type RevealStatus } from '@/lib/validation';

type RevealRow = {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  status: RevealStatus;
  created_at: string;
  expires_at: string;
  listing: { title: string; contact: string[] } | null;
  buyer: ProfileRef | null;
  seller: ProfileRef | null;
};
type ProfileRef = {
  id: string;
  display_name: string | null;
  school_unit: string | null;
  class_year: string | null;
  contact_instagram: string | null;
  contact_phone: string | null;
  contact_email: string | null;
};

const SELECT = `id, listing_id, buyer_id, seller_id, status, created_at, expires_at,
  listing:listings(title, contact),
  buyer:profiles!reveal_requests_buyer_id_fkey(id, display_name, school_unit, class_year, contact_instagram, contact_phone, contact_email),
  seller:profiles!reveal_requests_seller_id_fkey(id, display_name, school_unit, class_year, contact_instagram, contact_phone, contact_email)`;

function toDto(row: RevealRow, viewerId: string) {
  const status = effectiveRevealStatus(row.status, row.expires_at);
  const isBuyer = row.buyer_id === viewerId;
  const counterpartRaw = isBuyer ? row.seller : row.buyer;
  const counterpart = counterpartRaw && {
    id: counterpartRaw.id,
    display_name: counterpartRaw.display_name,
    school_unit: counterpartRaw.school_unit,
    class_year: counterpartRaw.class_year,
  };
  const dto: Record<string, unknown> = {
    id: row.id,
    listing_id: row.listing_id,
    listing_title: row.listing?.title ?? '',
    status,
    created_at: row.created_at,
    expires_at: row.expires_at,
    counterpart,
  };
  // Contact info is only ever exposed to the buyer, only once approved,
  // and only for the methods the seller offered on the listing.
  if (isBuyer && status === 'approved' && row.seller) {
    const offered = row.listing?.contact ?? [];
    dto.contact = {
      ...(offered.includes('instagram') && row.seller.contact_instagram
        ? { instagram: row.seller.contact_instagram } : {}),
      ...(offered.includes('phone') && row.seller.contact_phone
        ? { phone: row.seller.contact_phone } : {}),
      ...(offered.includes('email') && row.seller.contact_email
        ? { email: row.seller.contact_email } : {}),
    };
  }
  return dto;
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Persist read-time expiry so the unique "live request" index frees up.
  await admin
    .from('reveal_requests')
    .update({ status: 'expired', resolved_at: new Date().toISOString() })
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString())
    .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`);

  const { data, error } = await admin
    .from('reveal_requests')
    .select(SELECT)
    .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as unknown as RevealRow[];
  return NextResponse.json({
    incoming: rows.filter((r) => r.seller_id === user.id).map((r) => toDto(r, user.id)),
    outgoing: rows.filter((r) => r.buyer_id === user.id).map((r) => toDto(r, user.id)),
  });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { listing_id } = await req.json().catch(() => ({}));
  if (!listing_id) return NextResponse.json({ error: 'listing_id required' }, { status: 400 });

  const { data: listing } = await admin
    .from('listings')
    .select('id, seller_id, archived')
    .eq('id', listing_id)
    .single();
  if (!listing || listing.archived) {
    return NextResponse.json({ error: 'listing not found' }, { status: 404 });
  }
  if (listing.seller_id === user.id) {
    return NextResponse.json({ error: 'cannot request your own listing' }, { status: 400 });
  }

  const { data, error } = await admin
    .from('reveal_requests')
    .insert({ listing_id, buyer_id: user.id, seller_id: listing.seller_id })
    .select(SELECT)
    .single();
  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'already requested' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(
    { reveal: toDto(data as unknown as RevealRow, user.id) },
    { status: 201 },
  );
}
```

- [ ] **Step 2: Create `src/app/api/reveals/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';
import { effectiveRevealStatus, type RevealStatus } from '@/lib/validation';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { action } = await req.json().catch(() => ({}));
  if (action !== 'approve' && action !== 'decline') {
    return NextResponse.json({ error: "action must be 'approve' or 'decline'" }, { status: 400 });
  }

  const { data: existing } = await admin
    .from('reveal_requests')
    .select('id, seller_id, status, expires_at')
    .eq('id', params.id)
    .single();
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (existing.seller_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const status = effectiveRevealStatus(existing.status as RevealStatus, existing.expires_at);
  if (status !== 'pending') {
    return NextResponse.json({ error: `request is already ${status}` }, { status: 409 });
  }

  const { data, error } = await admin
    .from('reveal_requests')
    .update({
      status: action === 'approve' ? 'approved' : 'declined',
      resolved_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .select('id, status')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reveal: data });
}
```

- [ ] **Step 3: Verify 401s + typecheck + commit**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/reveals   # expect 401
npx tsc --noEmit
git add src/app/api/reveals
git commit -m "feat: reveal-request API with 72h computed expiry and contact gating"
```

### Task 9: Store + types rewrite (kill all mock data)

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/store.ts`
- Modify: `src/lib/data.ts`
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/app/(app)/listing/[id]/page.tsx`
- Modify: `src/components/WebApp.tsx` (only the identifiers listed below — full restyle is Task 11)

**Interfaces:**
- Consumes: API shapes from Tasks 5–8.
- Produces (used by Tasks 11–12):
  - `types.ts`: `Seller = { id: string; name: string; unit: string; year: string; handle?: string; isDemo?: boolean }`; `ActivityItem = { id: string; dir: 'in' | 'out'; who: string; school: string; listingTitle: string; when: string; status: ActivityStatus; contact?: { instagram?: string; phone?: string; email?: string } }`; `ActivityStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'EXPIRED'`. `Listing` unchanged except `seller: Seller` and remove `sales` (delete `Seller.sales`, `Seller.first`).
  - `store.ts` `FlipdStore`: keeps `listings, listingsLoading, savedIds, activity, isSaved, toggleSave, addListing, getListing, setArchived, myListings, pastListings, savedListings, pendingCount`; **adds** `me: Profile | null`, `requestReveal(listingId: string): Promise<{ ok: boolean; error?: string }>`, `respondReveal(id: string, action: 'approve' | 'decline'): Promise<boolean>`, `refreshActivity(): Promise<void>`, `signOut(): Promise<void>`, `myRevealFor(listingId: string): ActivityItem | undefined`; **removes** `CURRENT_USER`, `logReveal`, `setActivityStatus`. `Profile` type re-exported from `types.ts` as `{ id: string; display_name: string | null; handle: string | null; school_unit: string | null; class_year: string | null; contact_instagram: string | null; contact_phone: string | null; contact_email: string | null; is_demo: boolean; created_at: string }`.

- [ ] **Step 1: Update `src/lib/types.ts`**

Replace the `Seller`, `ActivityItem` definitions and add `Profile`:

```ts
export interface Seller {
  id: string;
  name: string;
  unit: string;
  year: string;
  handle?: string;
  isDemo?: boolean;
}

export interface Profile {
  id: string;
  display_name: string | null;
  handle: string | null;
  school_unit: string | null;
  class_year: string | null;
  contact_instagram: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  is_demo: boolean;
  created_at: string;
}

export type ActivityDir = 'in' | 'out';
export type ActivityStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'EXPIRED';

export interface RevealContact {
  instagram?: string;
  phone?: string;
  email?: string;
}

export interface ActivityItem {
  id: string;
  dir: ActivityDir;
  who: string;
  school: string;
  listingTitle: string;
  listingId: string;
  when: string;
  status: ActivityStatus;
  contact?: RevealContact;
}
```

Keep `PhotoTone`, `CategoryId`, `ContactMethod`, `Listing` (with `seller: Seller`), `Category`, `NewListingInput`, `FilterArgs` as they are.

- [ ] **Step 2: Trim `src/lib/data.ts`**

Delete `CURRENT_USER`, `MOCK_LISTINGS`. Keep `USC_UNITS` and `CATEGORIES` (change the `popup` entry's id to `event` so the chip filter matches the DB category used by post flow and seed: `{ id: 'event', label: 'Popups', icon: 'event' }`).

- [ ] **Step 3: Rewrite `src/lib/store.ts`**

Full new contents:

```ts
// Flipd — shared interactive store. One hook mounted at the app root.
// Hydrates everything from the API routes; no mock data.
import React from 'react';
import { CATEGORIES } from './data';
import type {
  ActivityItem, ActivityStatus, FilterArgs, Listing, Profile, RevealContact, Seller,
} from './types';
import { effectiveRevealStatus, type RevealStatus } from './validation';

type DbSeller = {
  id: string;
  display_name: string | null;
  handle: string | null;
  school_unit: string | null;
  class_year: string | null;
  is_demo: boolean;
} | null;

type DbListing = {
  id: string;
  seller_id: string;
  category: string;
  title: string;
  description?: string | null;
  price?: number | null;
  location?: string | null;
  contact?: string[] | null;
  photo_urls?: string[] | null;
  photo_focus?: string[] | null;
  archived?: boolean | null;
  created_at?: string | null;
  seller?: DbSeller;
};

type RevealDto = {
  id: string;
  listing_id: string;
  listing_title: string;
  status: RevealStatus;
  created_at: string;
  expires_at: string;
  counterpart: { id: string; display_name: string | null; school_unit: string | null; class_year: string | null } | null;
  contact?: RevealContact;
};

export function formatPostedDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function classYearLabel(year: string | null): string {
  if (!year) return '';
  const two = year.slice(-2);
  return two ? `’${two}` : '';
}

function mapSeller(row: DbListing): Seller {
  const s = row.seller;
  return {
    id: s?.id ?? row.seller_id,
    name: s?.display_name ?? 'Flipd member',
    unit: s?.school_unit ?? '',
    year: classYearLabel(s?.class_year ?? null),
    handle: s?.handle ?? undefined,
    isDemo: s?.is_demo ?? false,
  };
}

function mapDbListing(row: DbListing, meId: string | null): Listing {
  const price = row.price ?? 0;
  return {
    id: row.id,
    mine: meId !== null && row.seller_id === meId,
    category: row.category,
    categoryLabel: CATEGORIES.find((c) => c.id === row.category)?.label || 'Goods',
    title: row.title,
    description: row.description || undefined,
    price,
    priceLabel: price > 0 ? '$' + price.toLocaleString('en-US') : 'Free',
    seller: mapSeller(row),
    meta: row.location || 'USC · pickup',
    photoTone: 'cream',
    photoLabel: 'photo',
    photo_urls: row.photo_urls || [],
    photo_focus: row.photo_focus || [],
    archived: row.archived ?? false,
    created_at: row.created_at || undefined,
    postedLabel: formatPostedDate(row.created_at) || 'just now',
    contactMethod: (row.contact?.[0] as Listing['contactMethod']) || 'instagram',
  };
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function mapReveal(dto: RevealDto, dir: 'in' | 'out'): ActivityItem {
  return {
    id: dto.id,
    dir,
    who: dto.counterpart?.display_name ?? 'Flipd member',
    school: [dto.counterpart?.school_unit, classYearLabel(dto.counterpart?.class_year ?? null)]
      .filter(Boolean).join(' '),
    listingTitle: dto.listing_title,
    listingId: dto.listing_id,
    when: timeAgo(dto.created_at),
    status: effectiveRevealStatus(dto.status, dto.expires_at).toUpperCase() as ActivityStatus,
    contact: dto.contact,
  };
}

export interface FlipdStore {
  me: Profile | null;
  listings: Listing[];
  listingsLoading: boolean;
  savedIds: Set<string>;
  activity: ActivityItem[];
  isSaved: (id: string) => boolean;
  toggleSave: (id: string) => void;
  addListing: (formData: FormData) => Promise<Listing | null>;
  getListing: (id: string) => Promise<Listing | null>;
  setArchived: (id: string, archived: boolean) => Promise<boolean>;
  requestReveal: (listingId: string) => Promise<{ ok: boolean; error?: string }>;
  respondReveal: (id: string, action: 'approve' | 'decline') => Promise<boolean>;
  refreshActivity: () => Promise<void>;
  myRevealFor: (listingId: string) => ActivityItem | undefined;
  signOut: () => Promise<void>;
  myListings: Listing[];
  pastListings: Listing[];
  savedListings: Listing[];
  pendingCount: number;
}

export function useFlipdStore(): FlipdStore {
  const [me, setMe] = React.useState<Profile | null>(null);
  const [meId, setMeId] = React.useState<string | null>(null);
  const [listings, setListings] = React.useState<Listing[]>([]);
  const [listingsLoading, setListingsLoading] = React.useState(true);
  const [savedIds, setSavedIds] = React.useState<Set<string>>(() => new Set());
  const [activity, setActivity] = React.useState<ActivityItem[]>([]);

  const refreshActivity = React.useCallback(async () => {
    const res = await fetch('/api/reveals').catch(() => null);
    if (!res || !res.ok) return;
    const { incoming, outgoing } = await res.json();
    const items = [
      ...(incoming as RevealDto[]).map((r) => ({ dto: r, dir: 'in' as const })),
      ...(outgoing as RevealDto[]).map((r) => ({ dto: r, dir: 'out' as const })),
    ]
      .sort((a, b) => new Date(b.dto.created_at).getTime() - new Date(a.dto.created_at).getTime())
      .map(({ dto, dir }) => mapReveal(dto, dir));
    setActivity(items);
  }, []);

  React.useEffect(() => {
    let alive = true;

    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : { profile: null }))
      .then(({ profile }) => {
        if (!alive) return;
        setMe(profile);
        const id = profile?.id ?? null;
        setMeId(id);
        // Listings need meId to compute `mine`; fetch after /api/me resolves.
        return fetch('/api/listings?include_archived=1')
          .then((r) => r.json())
          .then(({ listings: fetched }) => {
            if (alive && Array.isArray(fetched)) {
              setListings(fetched.map((row: DbListing) => mapDbListing(row, id)));
            }
          });
      })
      .catch(() => {})
      .finally(() => { if (alive) setListingsLoading(false); });

    fetch('/api/saves')
      .then((r) => r.json())
      .then(({ ids }) => { if (alive && Array.isArray(ids)) setSavedIds(new Set(ids)); })
      .catch(() => {});

    refreshActivity();
    const interval = setInterval(refreshActivity, 30_000);
    return () => { alive = false; clearInterval(interval); };
  }, [refreshActivity]);

  const isSaved = (id: string) => savedIds.has(id);

  const toggleSave = (id: string) => {
    const willSave = !savedIds.has(id);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (willSave) next.add(id); else next.delete(id);
      return next;
    });
    fetch('/api/saves', {
      method: willSave ? 'POST' : 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listing_id: id }),
    }).catch(() => {
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (willSave) next.delete(id); else next.add(id);
        return next;
      });
    });
  };

  const addListing = async (formData: FormData): Promise<Listing | null> => {
    let res: Response;
    try {
      res = await fetch('/api/listings', { method: 'POST', body: formData });
    } catch (err) {
      console.error('[addListing] network error', err);
      throw new Error('Could not reach the server. Check your connection and try again.');
    }
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        if (body?.error) detail = body.error;
      } catch { /* no JSON body */ }
      throw new Error(detail);
    }
    const { listing } = await res.json();
    const mapped = mapDbListing(listing, meId);
    setListings((prev) => [mapped, ...prev]);
    return mapped;
  };

  const getListing = async (id: string): Promise<Listing | null> => {
    const local = listings.find((l) => l.id === id);
    if (local) return local;
    const res = await fetch(`/api/listings/${id}`).catch(() => null);
    if (!res || !res.ok) return null;
    const { listing } = await res.json();
    return mapDbListing(listing, meId);
  };

  const setArchived = async (id: string, archived: boolean): Promise<boolean> => {
    const res = await fetch(`/api/listings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived }),
    }).catch(() => null);
    if (!res || !res.ok) return false;
    setListings((prev) => prev.map((l) => (l.id === id ? { ...l, archived } : l)));
    return true;
  };

  const requestReveal = async (listingId: string) => {
    const res = await fetch('/api/reveals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listing_id: listingId }),
    }).catch(() => null);
    if (!res) return { ok: false, error: 'Network error — try again.' };
    if (res.status === 409) { await refreshActivity(); return { ok: true }; }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.error || `HTTP ${res.status}` };
    }
    await refreshActivity();
    return { ok: true };
  };

  const respondReveal = async (id: string, action: 'approve' | 'decline') => {
    const res = await fetch(`/api/reveals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    }).catch(() => null);
    if (!res || !res.ok) return false;
    setActivity((prev) => prev.map((a) =>
      a.id === id ? { ...a, status: action === 'approve' ? 'APPROVED' : 'DECLINED' } : a,
    ));
    return true;
  };

  const myRevealFor = (listingId: string) =>
    activity.find((a) => a.dir === 'out' && a.listingId === listingId &&
      (a.status === 'PENDING' || a.status === 'APPROVED'));

  const signOut = async () => {
    await fetch('/api/auth/signout', { method: 'POST' }).catch(() => {});
    window.location.href = '/';
  };

  const myListings = listings.filter((l) => l.mine && !l.archived);
  const pastListings = listings.filter((l) => l.mine && l.archived);
  const savedListings = listings.filter((l) => savedIds.has(l.id) && !l.archived);
  const pendingCount = activity.filter((a) => a.dir === 'in' && a.status === 'PENDING').length;

  return {
    me, listings, listingsLoading, savedIds, activity,
    isSaved, toggleSave, addListing, getListing, setArchived,
    requestReveal, respondReveal, refreshActivity, myRevealFor, signOut,
    myListings, pastListings, savedListings, pendingCount,
  };
}

export function filterListings(
  listings: Listing[],
  { activeCat = 'all', query = '', sort = 'recent', priceFilter = 'any' }: FilterArgs = {},
): Listing[] {
  let out = listings.filter((l) => {
    if (l.archived) return false;
    if (activeCat !== 'all' && l.category !== activeCat) return false;
    if (query) {
      const q = query.toLowerCase();
      const hay = (l.title + ' ' + l.meta + ' ' + l.categoryLabel + ' ' + l.seller.name).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    const price = l.price ?? 0;
    if (priceFilter === 'free' && price !== 0) return false;
    if (priceFilter === 'u25' && price > 25) return false;
    if (priceFilter === 'u100' && price > 100) return false;
    return true;
  });
  if (sort === 'low') out = [...out].sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
  if (sort === 'high') out = [...out].sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
  return out;
}
```

- [ ] **Step 4: Update call sites**

- `src/app/(app)/layout.tsx`: replace `approve`/`decline` handlers with `store.respondReveal(id, 'approve')` / `store.respondReveal(id, 'decline')`.
- `src/app/(app)/listing/[id]/page.tsx`: replace `store.logReveal(listing)` in `RevealModal onContinue` with `store.requestReveal(listing.id)` (async fire-and-forget is fine here; Task 11 upgrades the button states).
- `src/components/WebApp.tsx` minimal compile fixes (full restyle later):
  - Remove `CURRENT_USER` import; in `WebCreate` step-3 previews replace `seller: CURRENT_USER` with `seller: { id: store.me?.id ?? '', name: store.me?.display_name ?? 'You', unit: store.me?.school_unit ?? '', year: '' }`.
  - In `WebProfile`, replace `const u = store.CURRENT_USER` usage with `store.me` fields (`store.me?.display_name ?? 'Your profile'`, `store.me?.school_unit`, joined date `formatPostedDate(store.me?.created_at)`).
  - Replace `store.setActivityStatus(...)` calls in `WebApp` root with `store.respondReveal(...)`.
  - `ActivityRow` contact block: `a.contact` is now an object — render each present entry (instagram with `instagram` icon, phone with `phone`, email with `mail`).
  - Delete the dead `WebRevealApprovedUnused` component.
  - In `WebListingDetail`, remove the seller `sales` references (none in detail; check `RevealModal`/profile) — `Seller.sales`/`Seller.first` no longer exist; fix all compile errors flagged by tsc.

- [ ] **Step 5: Typecheck, run unit tests, commit**

```bash
npx tsc --noEmit && npx vitest run
git add -A
git commit -m "feat: store hydrates from real APIs — profiles, reveals, per-user saves; mocks deleted"
```

- [ ] **Step 6: Manual end-to-end checkpoint (requires two real @usc.edu inboxes or Supabase dashboard user creation)**

With `npm run dev`: sign in via magic link (POST from landing comes in Task 12 — for now visit Supabase dashboard → Auth → create user, or use the API: `curl -X POST localhost:3000/api/auth/signin -d '{"email":"you@usc.edu"}' -H 'Content-Type: application/json'` and click the emailed link). Complete onboarding, confirm the feed shows the 12 demo listings with "Flipd Team" as seller, post a listing, save/unsave, archive/restore. Report any failures before proceeding.

---

## Phase 5 — App restyle (A1 clean market)

### Task 10: Design tokens + shared components

**Files:**
- Modify: `src/app/globals.css` (full rewrite)
- Modify: `src/app/layout.tsx` (next/font Inter)
- Modify: `src/components/ui.tsx`

**Interfaces:**
- Produces: CSS vars `--bg, --ink, --ink-2, --muted, --surface, --surface-2, --accent, --accent-dark, --rule, --r-card, --r-img, --r-pill, --shadow, --shadow-hover` (plus legacy aliases `--cardinal: var(--accent)`, `--cream: var(--surface)`, `--cardinal-dark: var(--accent-dark)`, `--gold: var(--accent)`, `--serif/--sans/--mono`: Inter — so unmigrated inline styles degrade gracefully instead of breaking). Components: `Wordmark` (lowercase `flipd` + accent dot, near-black), `Avatar` (neutral gray/near-black), `Button` (primary=accent, secondary=surface neutral, ghost), `ListingCard` (A1: rounded photo, bold near-black price line, title, gray meta), `CategoryChip` (text-only pill, active near-black). `USCBadge` deleted. Consumed by Tasks 11–12.

- [ ] **Step 1: Inter via next/font**

Rewrite `src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Flipd — the verified marketplace for USC students',
  description:
    'Flipd is a marketplace only for verified @usc.edu students. Buy and sell on campus — services, food, popups, sublets, and goods — without the scams.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Rewrite `src/app/globals.css`**

Full new contents (drop the Google Fonts @import — next/font handles it):

```css
/* Flipd — A1 "clean market" tokens. White ground, near-black ink, gray
   metadata, cardinal reserved for prices/CTAs/accents. Inter only. */

:root {
  --bg: #ffffff;
  --ink: #111111;
  --ink-2: #333333;
  --muted: #98a0a8;
  --muted-2: #b6bcc2;
  --surface: #f2f3f5;
  --surface-2: #e9eaee;
  --accent: #990000;
  --accent-dark: #6b0000;
  --rule: #ececee;
  --rule-strong: #d9dadd;

  /* Legacy aliases — inline styles not yet migrated keep rendering sanely. */
  --cardinal: var(--accent);
  --cardinal-dark: var(--accent-dark);
  --cardinal-ink: var(--accent-dark);
  --gold: var(--accent);
  --gold-soft: var(--surface);
  --paper: var(--bg);
  --cream: var(--surface);
  --cream-2: var(--surface);

  --serif: var(--font-inter), -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
  --sans: var(--font-inter), -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
  --mono: var(--font-inter), -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;

  --r-card: 12px;
  --r-img: 12px;
  --r-pill: 999px;

  --shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  --shadow-hover: 0 6px 20px rgba(0, 0, 0, 0.09);
  --shadow-strong: 0 8px 30px rgba(0, 0, 0, 0.12);
}

* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0; background: var(--bg);
  font-family: var(--sans);
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
}
button { font: inherit; cursor: pointer; }

/* Motion */
@keyframes flipdReveal {
  0% { opacity: 0; transform: scale(0.98); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes riseIn {
  from { opacity: 0; transform: translateY(40px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes drift {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-9px); }
}
@keyframes sheetUp {
  0% { transform: translateY(24px); opacity: 0; }
  100% { transform: translateY(0); opacity: 1; }
}

/* Typography utilities */
.t-eyebrow {
  font-weight: 700; font-size: 11px; letter-spacing: 0.08em;
  text-transform: uppercase; line-height: 1;
}
.t-h1 { font-weight: 800; font-size: 28px; letter-spacing: -0.035em; line-height: 1.08; color: var(--ink); }
.t-h2 { font-weight: 800; font-size: 20px; letter-spacing: -0.02em; line-height: 1.15; color: var(--ink); }
.t-h3 { font-weight: 700; font-size: 14px; line-height: 1.25; color: var(--ink); }
.t-body { font-size: 14px; font-weight: 400; line-height: 1.55; color: var(--ink-2); }
.t-meta { font-size: 11.5px; font-weight: 500; color: var(--muted); }
.t-mono { font-size: 10px; font-weight: 500; letter-spacing: 0.02em; }

/* Buttons */
.btn {
  font-weight: 600; font-size: 13px; border-radius: var(--r-pill);
  padding: 10px 22px; border: 1.5px solid transparent;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  white-space: nowrap; transition: all 160ms ease-out; text-decoration: none;
}
.btn-primary { background: var(--accent); color: #fff; }
.btn-primary:hover { background: var(--accent-dark); }
.btn-secondary { background: var(--surface); color: var(--ink); }
.btn-secondary:hover { background: var(--surface-2); }
.btn-ghost { background: transparent; color: var(--ink); }
.btn-ghost:hover { background: var(--surface); }
.btn-on-dark { background: #fff; color: var(--ink); }
.btn-disabled { background: var(--surface); color: var(--muted-2); cursor: not-allowed; }

/* Pills */
.pill {
  display: inline-flex; align-items: center; gap: 4px;
  border-radius: var(--r-pill); padding: 4px 10px;
  font-weight: 700; font-size: 10px; letter-spacing: 0.06em;
  text-transform: uppercase; line-height: 1;
}
.pill-verified { background: var(--ink); color: #fff; }
.pill-category { background: var(--surface); color: var(--ink-2); }
.pill-event { background: var(--accent); color: #fff; }
.pill-new { background: var(--ink); color: #fff; }

/* Photo placeholder (listings with no photo) */
.ph {
  position: relative; overflow: hidden;
  background: var(--surface);
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--r-img);
}
.ph[data-tone] { background: var(--surface); background-image: none; }
.ph__label {
  font-size: 10px; font-weight: 600; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--muted);
  padding: 4px 9px; border-radius: 4px; background: #fff;
}

/* Cards */
.card {
  background: #fff; border-radius: var(--r-card);
  border: 1px solid var(--rule); overflow: hidden;
  box-shadow: var(--shadow);
  transition: box-shadow 160ms ease-out, transform 160ms ease-out;
}
.card-hover:hover { box-shadow: var(--shadow-hover); transform: translateY(-2px); }

/* Callout */
.callout {
  background: var(--surface); border-left: 3px solid var(--accent);
  padding: 14px 18px; border-radius: 0 8px 8px 0;
}

/* Divider */
.rule { height: 1px; background: var(--rule); border: 0; margin: 0; }

/* Form fields */
.field {
  width: 100%; background: var(--surface);
  border: 1.5px solid transparent; border-radius: 10px;
  padding: 13px 16px; font-family: var(--sans); font-size: 14.5px;
  color: var(--ink); outline: none;
  transition: border-color 160ms ease-out, background 160ms ease-out;
}
.field:focus { border-color: var(--ink); background: #fff; }
.field::placeholder { color: var(--muted); }
.field-label {
  font-weight: 700; font-size: 11px; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--ink);
  margin-bottom: 6px; display: block;
}

/* Wordmark */
.wordmark { font-weight: 800; letter-spacing: -0.04em; color: var(--ink); }
.wordmark .dot { color: var(--accent); }
.wordmark-on-dark { color: #fff; }
.wordmark-on-dark .dot { color: var(--accent); }

::selection { background: var(--ink); color: #fff; }
```

- [ ] **Step 3: Update `src/components/ui.tsx`**

Make these exact component changes (rest of the file unchanged):

`Wordmark` — lowercase, near-black:

```tsx
export function Wordmark({ size = 22, onDark = false }: { size?: number; onDark?: boolean }) {
  return (
    <span
      className={`wordmark ${onDark ? 'wordmark-on-dark' : ''}`}
      style={{ fontSize: size, lineHeight: 1, display: 'inline-flex', alignItems: 'baseline' }}
    >
      flipd<span className="dot">.</span>
    </span>
  );
}
```

`USCBadge` — delete the component entirely (call sites removed in Task 11 / Landing rebuild in Task 12).

`Avatar` — neutral palette:

```tsx
export function Avatar({
  name = '?', size = 28, tone = 'cream',
}: { name?: string; size?: number; tone?: PhotoTone }) {
  const initials = name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();
  const dark = tone === 'cardinal' || tone === 'ink';
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%',
        background: dark ? 'var(--ink)' : 'var(--surface-2)',
        color: dark ? '#fff' : 'var(--ink)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 600, fontSize: size * 0.4, letterSpacing: '0.02em', flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}
```

`ListingCard` — full replacement (A1: photo tile, price-first text block, no price pill, no divider, hover lift):

```tsx
export function ListingCard({
  listing, onClick, compact = false,
}: { listing: Listing; onClick?: () => void; compact?: boolean }) {
  return (
    <div
      className={onClick ? 'card-hover' : undefined}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', transition: 'transform 160ms ease-out' }}
    >
      <div style={{ position: 'relative', aspectRatio: '1 / 1', borderRadius: 'var(--r-img)', overflow: 'hidden', background: 'var(--surface)' }}>
        {listing.photo_urls?.[0] ? (
          <img
            src={listing.photo_urls[0]}
            alt={listing.title}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: listing.photo_focus?.[0] || '50% 50%' }}
          />
        ) : (
          <Placeholder label={listing.photoLabel} tone={listing.photoTone} height="100%" radius={0} style={{ position: 'absolute', inset: 0 }} />
        )}
        {listing.eventPill && (
          <div style={{ position: 'absolute', top: 8, left: 8 }}>
            <Pill kind="event">{listing.eventPill}</Pill>
          </div>
        )}
      </div>
      <div style={{ padding: compact ? '8px 2px 0' : '9px 2px 0', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)', letterSpacing: '-0.01em' }}>
          {listing.priceLabel}
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {listing.title}
        </div>
        <div className="t-meta" style={{ fontSize: 11.5, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {listing.meta.split(' · ')[0]} · {listing.seller.name.split(' ')[0]}
          {listing.seller.year ? `, ${listing.seller.year}` : ''}
        </div>
      </div>
    </div>
  );
}
```

`CategoryChip` — text-only pill, active = near-black fill:

```tsx
export function CategoryChip({
  category, active, onClick,
}: { category: { id: string; label: string; icon: string }; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center',
        padding: '8px 16px', borderRadius: 'var(--r-pill)', border: 0,
        background: active ? 'var(--ink)' : 'var(--surface)',
        color: active ? '#fff' : 'var(--ink-2)',
        fontWeight: 600, fontSize: 13,
        transition: 'all 160ms ease-out', whiteSpace: 'nowrap', flexShrink: 0,
      }}
    >
      {category.label}
    </button>
  );
}
```

`Button`, `Pill`, `Placeholder`, `Callout` need no code change (they read the rewritten CSS classes).

- [ ] **Step 4: Typecheck + visual check + commit**

Run `npx tsc --noEmit` (expect errors only at `USCBadge` call sites in `WebApp.tsx`/`Landing.tsx` — remove those imports/usages now: in `WebApp.tsx` header delete `<USCBadge size={26} />` and its import; `Landing.tsx` is fully rebuilt in Task 12, so just delete the `USCBadge` import + usages there too). Re-run until clean. Then `npm run dev`, open /feed, confirm new tokens render.

```bash
git add src/app/globals.css src/app/layout.tsx src/components/ui.tsx src/components/WebApp.tsx src/components/Landing.tsx
git commit -m "style: A1 clean-market tokens, Inter via next/font, restyled shared components"
```

### Task 11: Restyle app screens + real reveal states

**Files:**
- Modify: `src/components/WebApp.tsx`
- Modify: `src/app/(app)/listing/[id]/page.tsx`

**Interfaces:**
- Consumes: store API from Task 9, tokens/components from Task 10.
- Produces: final app screens. No API changes.

Apply these changes in `WebApp.tsx` (keep all logic; this is styling + reveal-state wiring):

- [ ] **Step 1: Header (`WebAppHeader`)**

- Wordmark only (no badge), size 24.
- Search input: `background: 'var(--surface)'`, no border, `borderRadius: 999`, placeholder "Search Flipd".
- Post button stays `btn-primary`; avatar uses `store.me` name — change the hardcoded `<Avatar name="Alex Park" …/>` to a `meName` prop: add `meName: string` to the props type, render `<Avatar name={meName} size={30} tone="ink" />`, and pass `meName={store.me?.display_name ?? 'Me'}` from both call sites (`(app)/layout.tsx` and the `WebApp` root component).
- Header container: `borderBottom: '1px solid var(--rule)'`, `background: 'rgba(255,255,255,0.85)'`, `backdropFilter: 'blur(12px)'`.

- [ ] **Step 2: Feed (`WebAppFeed`)**

- Page title: replace serif h1 with `fontWeight: 800, fontSize: 26, letterSpacing: '-0.03em'`; copy `Today on Flipd` (or `Results for "…"` when searching).
- Grid: `gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))'`, `gap: 20` — denser, responsive.
- Save button on cards: keep, but circular white with `--shadow`, bookmark icon `--accent` when saved.

- [ ] **Step 3: Listing detail (`WebListingDetail`) — restyle + real reveal button**

- Price: `fontWeight: 800, fontSize: 26, color: 'var(--ink)'` (near-black price per A1; accent stays for CTAs). Show `negotiable` text only when the listing has it (field exists on DbListing rows; add `negotiable?: boolean` to `Listing` and map it in `mapDbListing` — one line each).
- Seller box: white card `border: '1px solid var(--rule)', borderRadius: 12` with Avatar, seller name, `unit year` meta line, and `Flipd Team` demo sellers get `<Pill kind="verified">FLIPD TEAM</Pill>`.
- Reveal button states, driven by `store.myRevealFor(listing.id)`:
  - none → `Reveal Contact` (primary, opens `RevealModal`);
  - `PENDING` → disabled secondary `Requested — waiting on seller`;
  - `APPROVED` → replace button area with the contact card: for each key in `reveal.contact` render an icon row (`instagram`/`phone`/`mail` icons) with the value as a link (`https://instagram.com/<handle-sans-@>`, `tel:`, `mailto:`).
- Remove the fake description fallbacks (the "Homemade weekly…" strings): if no description, render nothing.
- Remove `isFood` variable (now unused).

- [ ] **Step 4: RevealModal — clean style + real request**

- Header band: `background: 'var(--ink)'`, white text, no gold bar, shield icon white; body copy unchanged except seller first name from `listing.seller.name`.
- `onContinue` handler (in `listing/[id]/page.tsx`): call `const r = await store.requestReveal(listing.id); if (!r.ok) alert(r.error)`. Keep confetti with colors `['#990000', '#111111', '#ffffff']`.

- [ ] **Step 5: Activity (`ActivityRow`, `WebNotifications`)**

- Status colors: `APPROVED → { bg: 'var(--ink)', fg: '#fff' }`, `PENDING → { bg: 'var(--accent)', fg: '#fff' }`, `EXPIRED/DECLINED → { bg: 'var(--surface)', fg: 'var(--muted)' }`.
- Contact chips: render one chip per entry in the `contact` object (instagram/phone/email), `background: 'var(--surface)'`, `color: 'var(--ink)'`, linked as in Step 3.
- Empty state for zero activity: reuse `EmptyState` with icon `bell`, title "No activity yet", sub "Reveal requests you send and receive show up here."

- [ ] **Step 6: Profile (`WebProfile`)**

- Banner → white: `background: '#fff'`, `borderBottom: '1px solid var(--rule)'`; name in `fontWeight: 800, fontSize: 26, color: 'var(--ink)'`; remove the gold bar div; meta line `{unit} {year} · joined {formatPostedDate(store.me?.created_at)}`; stats number style `fontWeight: 800, color: 'var(--ink)'`.
- Tabs: text `var(--muted)`, active `var(--ink)` with `borderBottom: '2px solid var(--ink)'`; count badge `background: 'var(--surface)', color: 'var(--ink)'`.
- Add a **Sign out** ghost button at the banner's right: `onClick={() => store.signOut()}`.
- Grids: same `auto-fill, minmax(200px, 1fr)` as feed.

- [ ] **Step 7: Create flow (`WebCreate`)**

- Category cards: icon box `background: 'var(--surface)'`, icon color `var(--ink)`; label `fontWeight: 700` (drop serif font-family inline styles).
- Stepper dots: active `var(--ink)`, inactive `var(--rule-strong)`; "STEP N OF 3" stays.
- AI generate button: text color `var(--accent)` when enabled (unchanged behavior).
- Headings: `fontWeight: 800, letterSpacing: '-0.03em'` (inherits Inter already).

- [ ] **Step 8: Sweep for leftovers**

```bash
grep -n "serif\|gold\|cream\|cardinal-dark\|USCBadge\|Flipd\." src/components/WebApp.tsx
```

Fix stragglers: no `var(--serif)` font-family inline styles remain (delete the property — Inter inherits), no gold/cream color usages, wordmark renders lowercase via component.

- [ ] **Step 9: Verify + commit**

`npx tsc --noEmit`; `npm run dev`; walk feed → detail → save → post → profile → activity in the browser; confirm the A1 look and reveal button states render.

```bash
git add -A
git commit -m "style: restyle all app screens to A1 clean market + real reveal states"
```

---

## Phase 6 — Marketing site (P1 pure Apple)

### Task 12: Rebuild `Landing.tsx` + wire real sign-in

**Files:**
- Rewrite: `src/components/Landing.tsx`
- Modify: `src/app/page.tsx`
- Modify: `package.json` (name → `flipd-web`)

**Interfaces:**
- Consumes: `POST /api/auth/signin` (Task 4), `Wordmark`, `Button`, `Icon`, tokens (Task 10).
- Produces: `Landing` component with no props (sign-in handled internally; "Sign in" scrolls to the CTA form). `src/app/page.tsx` becomes a server component that redirects signed-in users to `/feed`.

- [ ] **Step 1: Root page becomes a server component with session check**

Rewrite `src/app/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/server';
import { Landing } from '@/components/Landing';

export default async function HomePage() {
  const user = await getSessionUser();
  if (user) redirect('/feed');
  return <Landing />;
}
```

- [ ] **Step 2: Rewrite `src/components/Landing.tsx`**

Full replacement. Structure (all Inter, white, centered; cardinal only in eyebrow + primary CTA):

```tsx
'use client';

// Flipd — marketing page. P1 "pure Apple": frosted sticky nav, centered hero,
// app visual rising into view, scroll-revealed sections, real magic-link CTA.
import React from 'react';
import { Icon } from './Icon';
import { Wordmark } from './ui';

// Scroll-reveal wrapper: fades content up the first time it enters the viewport.
function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [shown, setShown] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setShown(true); obs.disconnect(); } },
      { threshold: 0.15 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'translateY(0)' : 'translateY(24px)',
        transition: `opacity 700ms cubic-bezier(.2,.7,.3,1) ${delay}ms, transform 700ms cubic-bezier(.2,.7,.3,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

const scrollTo = (id: string) =>
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

function Nav() {
  return (
    <header
      style={{
        position: 'sticky', top: 0, zIndex: 20,
        display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 28,
        padding: '14px 32px', background: 'rgba(255,255,255,0.8)',
        backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      <Wordmark size={18} />
      {[
        { label: 'How it works', id: 'how' },
        { label: 'Categories', id: 'categories' },
        { label: 'Trust', id: 'trust' },
      ].map((l) => (
        <a
          key={l.id}
          href={`#${l.id}`}
          onClick={(e) => { e.preventDefault(); scrollTo(l.id); }}
          style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-2)', textDecoration: 'none' }}
        >
          {l.label}
        </a>
      ))}
      <button className="btn" onClick={() => scrollTo('join')}
        style={{ background: 'var(--ink)', color: '#fff', padding: '8px 18px', fontSize: 12.5 }}>
        Sign in
      </button>
    </header>
  );
}

// Mini feed mockup used as the hero visual.
function HeroAppVisual() {
  const tiles = [
    { price: '$12', title: 'Sourdough loaves', img: 'https://picsum.photos/seed/flipd-bread/400/400' },
    { price: '$35', title: 'Press-on nails', img: 'https://picsum.photos/seed/flipd-nails/400/400' },
    { price: '$90', title: 'IKEA Markus chair', img: 'https://picsum.photos/seed/flipd-chair/400/400' },
    { price: '$7', title: 'Matcha drinks', img: 'https://picsum.photos/seed/flipd-matcha/400/400' },
  ];
  const floatCard = (t: typeof tiles[number], dur: string) => (
    <div className="card" style={{ width: 168, animation: `drift ${dur} ease-in-out infinite`, boxShadow: 'var(--shadow-strong)' }}>
      <img src={t.img} alt="" style={{ width: '100%', height: 96, objectFit: 'cover', display: 'block' }} />
      <div style={{ padding: '8px 12px 12px' }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>{t.price}</div>
        <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>{t.title}</div>
      </div>
    </div>
  );
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 28, padding: '56px 24px 0', animation: 'riseIn 1s cubic-bezier(.2,.7,.3,1) both 500ms' }}>
      <div style={{ display: 'none' }} className="hide-sm" />
      {floatCard(tiles[2], '5.4s')}
      <div className="card" style={{ width: 300, boxShadow: 'var(--shadow-strong)' }}>
        <div style={{ padding: '14px 16px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Wordmark size={17} />
          <Icon name="search" size={15} color="var(--ink)" />
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '0 16px 12px' }}>
          {['All', 'Food', 'Services'].map((c, i) => (
            <span key={c} style={{ fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 999, background: i === 0 ? 'var(--ink)' : 'var(--surface)', color: i === 0 ? '#fff' : 'var(--ink-2)' }}>{c}</span>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '0 16px 18px' }}>
          {tiles.slice(0, 2).map((t) => (
            <div key={t.title}>
              <img src={t.img} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 10, display: 'block' }} />
              <div style={{ fontWeight: 800, fontSize: 13, marginTop: 6 }}>{t.price}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>{t.title}</div>
            </div>
          ))}
        </div>
      </div>
      {floatCard(tiles[3], '6.1s')}
    </div>
  );
}

function Hero() {
  return (
    <section style={{ textAlign: 'center', padding: '84px 24px 96px', overflow: 'hidden' }}>
      <div style={{ animation: 'fadeUp .8s cubic-bezier(.2,.7,.3,1) both 100ms', fontSize: 14, fontWeight: 600, color: 'var(--accent)' }}>
        The marketplace for USC.
      </div>
      <h1 style={{ animation: 'fadeUp .8s cubic-bezier(.2,.7,.3,1) both 250ms', fontSize: 'clamp(40px, 7vw, 68px)', fontWeight: 800, letterSpacing: '-0.045em', lineHeight: 1.02, color: 'var(--ink)', margin: '14px 0 0' }}>
        Buy from people<br />who show up.
      </h1>
      <p style={{ animation: 'fadeUp .8s cubic-bezier(.2,.7,.3,1) both 400ms', fontSize: 17, color: 'var(--muted)', fontWeight: 500, margin: '20px auto 0', maxWidth: 480 }}>
        Every buyer and seller verified with @usc.edu. No scams, no strangers, no ghosting.
      </p>
      <div style={{ animation: 'fadeUp .8s cubic-bezier(.2,.7,.3,1) both 550ms', marginTop: 28, display: 'flex', gap: 14, justifyContent: 'center', alignItems: 'center' }}>
        <button className="btn btn-primary" style={{ padding: '13px 28px', fontSize: 14 }} onClick={() => scrollTo('join')}>
          Get started
        </button>
        <a href="#how" onClick={(e) => { e.preventDefault(); scrollTo('how'); }}
          style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>
          How it works ›
        </a>
      </div>
      <HeroAppVisual />
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: '1', title: 'Verify with your USC email', body: 'Magic-link sign-in. No passwords. You’re tied to your @usc.edu the whole way through.' },
    { n: '2', title: 'Browse the campus feed', body: 'Services, food, popups, sublets, goods — every listing from a real, signed-in USC student.' },
    { n: '3', title: 'Reveal contact', body: 'The seller sees your name, school, and year, and has 72 hours to approve. Then you connect and meet up.' },
  ];
  return (
    <section id="how" style={{ padding: '96px 24px', background: 'var(--surface)', scrollMarginTop: 60 }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <Reveal>
          <h2 style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.035em', textAlign: 'center', margin: '0 0 48px' }}>
            Three steps. No DMs from strangers.
          </h2>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {steps.map((s, i) => (
            <Reveal key={s.n} delay={i * 120}>
              <div style={{ background: '#fff', borderRadius: 16, padding: 28, height: '100%' }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--ink)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>{s.n}</div>
                <h3 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', margin: '16px 0 8px' }}>{s.title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--ink-2)', margin: 0 }}>{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Categories() {
  const cats = [
    { icon: 'services', label: 'Services', sub: 'nails · hair · tutoring · photo' },
    { icon: 'food', label: 'Food', sub: 'bakers · meal prep · drinks' },
    { icon: 'event', label: 'Popups', sub: 'events · fundraisers' },
    { icon: 'housing', label: 'Housing', sub: 'sublets · roommates' },
    { icon: 'goods', label: 'Goods', sub: 'furniture · books · tech' },
  ];
  return (
    <section id="categories" style={{ padding: '96px 24px', scrollMarginTop: 60 }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <Reveal>
          <h2 style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.035em', textAlign: 'center', margin: '0 0 48px' }}>
            Whatever campus is selling.
          </h2>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          {cats.map((c, i) => (
            <Reveal key={c.label} delay={i * 80}>
              <div style={{ border: '1px solid var(--rule)', borderRadius: 16, padding: '24px 18px', minHeight: 140, display: 'flex', flexDirection: 'column' }}>
                <Icon name={c.icon} size={24} stroke={1.6} color="var(--ink)" />
                <div style={{ marginTop: 'auto' }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 3px', letterSpacing: '-0.01em' }}>{c.label}</h3>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{c.sub}</div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Trust() {
  const stats = [
    { stat: '100%', label: 'verified @usc.edu accounts' },
    { stat: '72h', label: 'seller approval window' },
    { stat: '0', label: 'anonymous interactions' },
  ];
  return (
    <section id="trust" style={{ padding: '96px 24px', background: 'var(--ink)', color: '#fff', scrollMarginTop: 60 }}>
      <div style={{ maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
        <Reveal>
          <h2 style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.035em', margin: '0 0 16px' }}>
            Verification isn’t a feature.<br />It’s the whole product.
          </h2>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.65)', maxWidth: 520, margin: '0 auto 48px', lineHeight: 1.6 }}>
            When you reveal contact on Flipd, both sides know exactly who’s on the other end — name, school, year. Accountability is built in.
          </p>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 100}>
              <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 16, padding: '28px 20px' }}>
                <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em' }}>{s.stat}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 6 }}>{s.label}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function JoinCTA() {
  const [email, setEmail] = React.useState('');
  const [state, setState] = React.useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = React.useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('sending');
    setError('');
    const res = await fetch('/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    if (res?.ok) { setState('sent'); return; }
    const body = await res?.json().catch(() => ({}));
    setError(body?.error || 'Something went wrong — try again.');
    setState('idle');
  };

  return (
    <section id="join" style={{ padding: '110px 24px', textAlign: 'center', scrollMarginTop: 60 }}>
      <Reveal>
        <h2 style={{ fontSize: 'clamp(30px, 5vw, 44px)', fontWeight: 800, letterSpacing: '-0.04em', margin: '0 0 12px' }}>
          Got an @usc.edu email?<br />You’re already in.
        </h2>
        <p style={{ fontSize: 15, color: 'var(--muted)', fontWeight: 500, margin: '0 0 30px' }}>
          Enter it below and we’ll email you a sign-in link. That’s the whole sign-up.
        </p>
        {state === 'sent' ? (
          <div style={{ maxWidth: 420, margin: '0 auto', background: 'var(--surface)', borderRadius: 14, padding: '22px 26px', textAlign: 'left' }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Check your email</div>
            <div style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>
              We sent a sign-in link to <strong>{email.trim().toLowerCase()}</strong>. Click it on this device to enter Flipd.
            </div>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: 'flex', gap: 8, maxWidth: 440, margin: '0 auto' }}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@usc.edu"
              aria-label="USC email address"
              className="field"
              style={{ flex: 1, borderRadius: 999, padding: '13px 22px' }}
            />
            <button type="submit" className="btn btn-primary" disabled={state === 'sending'} style={{ padding: '13px 24px' }}>
              {state === 'sending' ? 'Sending…' : 'Send my link'}
            </button>
          </form>
        )}
        <div style={{ fontSize: 12, marginTop: 14, color: error ? 'var(--accent)' : 'var(--muted)' }}>
          {error || 'USC-only. No passwords, no phone numbers.'}
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer style={{ padding: '28px 32px', borderTop: '1px solid var(--rule)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--muted)' }}>
      <Wordmark size={15} />
      <span>© 2026 · made in University Park</span>
    </footer>
  );
}

export function Landing() {
  return (
    <div style={{ background: '#fff', minHeight: '100%' }}>
      <Nav />
      <Hero />
      <HowItWorks />
      <Categories />
      <Trust />
      <JoinCTA />
      <Footer />
    </div>
  );
}
```

- [ ] **Step 3: Rename package**

In `package.json`: `"name": "flipd-web"`.

- [ ] **Step 4: Verify + commit**

`npx tsc --noEmit`; `npm run dev`; open http://localhost:3000 signed out — confirm hero animation, scroll reveals, and that submitting a gmail address shows the USC-only error inline while a usc.edu address flips to "Check your email".

```bash
git add -A
git commit -m "feat: P1 pure-Apple marketing page with real magic-link sign-in"
```

---

## Phase 7 — Final verification

### Task 13: Build, advisors, E2E, cleanup

**Files:**
- None new (fixes only).

- [ ] **Step 1: Full build + tests**

```bash
npx vitest run && npm run build
```

Expected: tests pass, build succeeds with no type errors. Fix anything that fails.

- [ ] **Step 2: Supabase advisors**

Call `mcp__supabase__get_advisors` (security). Expected: no CRITICAL items. (INFO "RLS enabled no policy" on profiles/saves/reveal_requests is by design.)

- [ ] **Step 3: Manual E2E (needs the user or two usc.edu inboxes)**

1. Landing → enter usc.edu email → click emailed link → onboarding → feed shows 12 demo listings.
2. Post a listing with a photo → appears in feed and My Listings.
3. Second account: save the listing, tap Reveal Contact → first account's Activity badge shows 1 → Approve → second account sees contact info.
4. Archive the listing → gone from feed, visible in Past Listings → Restore.
5. Sign out → protected routes redirect to landing.

- [ ] **Step 4: Grep sweep for banned terms**

```bash
grep -rn "Tassel\|MOCK_LISTINGS\|CURRENT_USER\|user_alex_park" src/ || echo CLEAN
```

Expected: `CLEAN` (package folder name `Tassel-handoff/` is gitignored and out of scope).

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: final verification pass"
```
