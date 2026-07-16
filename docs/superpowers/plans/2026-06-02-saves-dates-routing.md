# Saves Persistence + Absolute Dates + Real Routing — Plan

> Execute inline (executing-plans). Not a git repo — verify with `npx tsc --noEmit` + API checks.

**Goals**
1. Persist saved listings in the DB (new `saves` table + API).
2. Show absolute posted dates (from `created_at`) instead of hardcoded labels.
3. Give each view a real Next.js route so refresh stays put and URLs are shareable. Share one store across routes via Context.

---

## Part A — Saves in the DB

### A1. Table
- [ ] MCP migration `create_saves`:
```sql
create table saves (
  listing_id uuid primary key references listings(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table saves disable row level security;
```

### A2. API — `src/app/api/saves/route.ts` (create)
- [ ] GET → `select listing_id from saves`; return `{ ids: string[] }`.
- [ ] POST body `{ listing_id }` → upsert; return `{ ok: true }`.
- [ ] DELETE body `{ listing_id }` → delete; return `{ ok: true }`.
Full code:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const { data, error } = await supabase.from('saves').select('listing_id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ids: data.map((r) => r.listing_id) });
}

export async function POST(req: NextRequest) {
  const { listing_id } = await req.json().catch(() => ({}));
  if (!listing_id) return NextResponse.json({ error: 'listing_id required' }, { status: 400 });
  const { error } = await supabase.from('saves').upsert({ listing_id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { listing_id } = await req.json().catch(() => ({}));
  if (!listing_id) return NextResponse.json({ error: 'listing_id required' }, { status: 400 });
  const { error } = await supabase.from('saves').delete().eq('listing_id', listing_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

### A3. Store
- [ ] On mount, fetch `/api/saves` and seed `savedIds` (replace the hardcoded `new Set(['l5','l7','l2'])` with empty `new Set()`).
- [ ] `toggleSave(id)` does optimistic local update AND fires POST/DELETE to `/api/saves`.

---

## Part B — Absolute posted dates

### B1. created_at through the model
- [ ] `Listing.created_at?: string` in types.
- [ ] `DbListing.created_at?: string | null`; `mapDbListing` sets `created_at` and computes `postedLabel` from it via a `formatDate` helper.

### B2. formatter (in store.ts, module scope)
```typescript
export function formatPostedDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
```
- [ ] In `mapDbListing`: `postedLabel: formatPostedDate(row.created_at) || 'just now'` and `created_at: row.created_at || undefined`.
- [ ] Detail view: replace `posted {listing.postedLabel || '2d ago'}` — already uses postedLabel; keep. Remove hardcoded `'2d ago'` fallback → `'recently'`.

---

## Part C — Real routes (shared store via Context)

### C1. Store context — `src/lib/store-context.tsx` (create)
```typescript
'use client';
import React from 'react';
import { useFlipdStore, type FlipdStore } from './store';

const Ctx = React.createContext<FlipdStore | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const store = useFlipdStore();
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): FlipdStore {
  const s = React.useContext(Ctx);
  if (!s) throw new Error('useStore must be used within StoreProvider');
  return s;
}
```

### C2. App shell layout — `src/app/(app)/layout.tsx` (create)
Wrap all app pages with the provider + shared header + modals. Header navigation pushes routes.
- Route group `(app)` holds feed/listing/post/profile so they share the layout but the URL has no `(app)` segment.
- The layout renders `WebAppHeader` (search pushes `/feed?q=`), `WebNotifications` (local open state), and `{children}`.

### C3. Pages (create), each a thin client component using `useStore()`:
- `src/app/(app)/feed/page.tsx` → renders `WebAppFeed`. Reads `q`, `cat`, `sort`, `price` from `useSearchParams`; updates URL on filter change. **Replaces existing `src/app/feed/page.tsx`.**
- `src/app/(app)/listing/[id]/page.tsx` → `useStore().getListing(id)`; renders `WebListingDetail`; back = `router.back()` or `/feed`; reveal modal local state.
- `src/app/(app)/post/page.tsx` → renders `WebCreate`; on publish push `/feed`.
- `src/app/(app)/profile/page.tsx` → renders `WebProfile`; tab from `?tab=`.

### C4. Refactor components to accept nav callbacks (already mostly do)
- `WebAppFeed`, `WebProfile` already take `onListing` — pass `(l) => router.push('/listing/' + l.id)`.
- `WebListingDetail` already takes `onBack`/`onReveal`.
- Add `getListing(id)` to store: returns loaded listing or fetches `/api/listings/[id]` (state: `null` while loading).

### C5. Decommission the monolith
- The old `WebApp` component can stay for reference but is no longer routed. Root `/` Landing now pushes `/feed` (unchanged).

### C6. getListing in store
```typescript
const getListing = async (id: string): Promise<Listing | null> => {
  const local = listings.find((l) => l.id === id);
  if (local) return local;
  const res = await fetch(`/api/listings/${id}`).catch(() => null);
  if (!res || !res.ok) return null;
  const { listing } = await res.json();
  return mapDbListing(listing);
};
```
Add to interface + return.

---

## Part D — Verify
- [ ] `npx tsc --noEmit` clean.
- [ ] Save a listing, refresh `/feed`, confirm still saved (GET /api/saves returns it).
- [ ] Posted date shows an absolute date.
- [ ] Visit `/profile`, refresh → stays on profile. Visit `/listing/<id>`, refresh → stays on detail. Past Listings tab shows archived + restore works.
- [ ] Clean up test rows.
