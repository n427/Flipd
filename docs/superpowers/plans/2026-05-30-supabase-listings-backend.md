# Supabase Listings Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the in-memory listings store with Supabase Postgres + Storage, wiring create and read through three Next.js API routes.

**Architecture:** Supabase Postgres holds listing rows; Supabase Storage holds photos in a public `listing-photos` bucket. Next.js API routes (service role key, server-only) handle all DB/storage access. The frontend `useFlipdStore` hook fetches listings on mount and posts FormData on publish; all other store state (saves, activity) stays in-memory unchanged.

**Tech Stack:** Next.js 14 App Router, `@supabase/supabase-js`, TypeScript, Supabase Postgres + Storage

---

## File Map

- **Modify:** `src/lib/types.ts` — add `photo_urls?: string[]` to `Listing`
- **Create:** `src/lib/supabase.ts` — server-side Supabase client (service role)
- **Create:** `src/app/api/listings/route.ts` — GET all + POST create
- **Create:** `src/app/api/listings/[id]/route.ts` — GET single listing
- **Modify:** `src/lib/store.ts` — replace listings init/addListing with API calls, add `listingsLoading`
- **Modify:** `src/components/WebApp.tsx` — pass `photos` Files in publish, show loading state
- **Modify:** `src/components/ui.tsx` — `ListingCard` renders real photo if `photo_urls[0]` present
- **Modify:** `src/components/WebApp.tsx` (`WebListingDetail`) — render real photos in main + thumbnails
- **Modify:** `.env.local` — add Supabase env vars

---

## Task 1: Add Supabase env vars and install SDK

**Files:**
- Modify: `.env.local`
- Modify: `package.json` (via npm)

- [ ] **Step 1: Install Supabase JS client**

```bash
cd /Users/nicole/E-commerce && npm install @supabase/supabase-js
```
Expected: `@supabase/supabase-js` added to `package.json` dependencies.

- [ ] **Step 2: Add env vars to `.env.local`**

Open `/Users/nicole/E-commerce/.env.local` and append (keep existing `ANTHROPIC_API_KEY`):

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

The user must fill in real values from their Supabase project dashboard (Settings → API).

- [ ] **Step 3: Verify install**

```bash
cd /Users/nicole/E-commerce && node -e "require('@supabase/supabase-js'); console.log('ok')"
```
Expected: `ok`

---

## Task 2: Create the Supabase `listings` table and storage bucket

**Files:** (done in Supabase dashboard — no code files)

- [ ] **Step 1: Create the table**

In the Supabase dashboard → SQL Editor, run:

```sql
create table listings (
  id uuid primary key default gen_random_uuid(),
  seller_id text not null default 'user_alex_park',
  category text not null,
  title text not null,
  description text,
  price integer not null default 0,
  negotiable boolean not null default false,
  location text,
  contact text[] not null default '{}',
  photo_urls text[] not null default '{}',
  created_at timestamptz not null default now()
);
```

- [ ] **Step 2: Disable RLS for now**

```sql
alter table listings disable row level security;
```

- [ ] **Step 3: Create the storage bucket**

In Supabase dashboard → Storage → New bucket:
- Name: `listing-photos`
- Public: **yes** (toggle on)
- Click Create

- [ ] **Step 4: Verify**

In SQL Editor:
```sql
select * from listings limit 1;
```
Expected: empty result set with no error.

---

## Task 3: Create the server-side Supabase client

**Files:**
- Create: `src/lib/supabase.ts`

- [ ] **Step 1: Create the file**

Create `/Users/nicole/E-commerce/src/lib/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient(supabaseUrl, serviceRoleKey);
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/nicole/E-commerce && npx tsc --noEmit 2>&1 | grep -v "popup"
```
Expected: no errors.

---

## Task 4: Add `photo_urls` to the `Listing` type

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add the field**

In `/Users/nicole/E-commerce/src/lib/types.ts`, add `photo_urls?: string[]` to the `Listing` interface after `description?`:

```typescript
export interface Listing {
  id: string;
  category: CategoryId | string;
  categoryLabel: string;
  title: string;
  price?: number;
  priceLabel: string;
  seller: Seller;
  meta: string;
  photoTone: PhotoTone;
  photoLabel: string;
  description?: string;
  photo_urls?: string[];
  mine?: boolean;
  eventPill?: string;
  postedLabel?: string;
  contactMethod?: ContactMethod;
  isNew?: boolean;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/nicole/E-commerce && npx tsc --noEmit 2>&1 | grep -v "popup"
```
Expected: no errors.

---

## Task 5: Create `GET /api/listings` and `POST /api/listings`

**Files:**
- Create: `src/app/api/listings/route.ts`

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p /Users/nicole/E-commerce/src/app/api/listings
```

Create `/Users/nicole/E-commerce/src/app/api/listings/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');
  const q = searchParams.get('q');

  let query = supabase
    .from('listings')
    .select('*')
    .order('created_at', { ascending: false });

  if (category && category !== 'all') {
    query = query.eq('category', category);
  }
  if (q) {
    query = query.ilike('title', `%${q}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ listings: data });
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();

  const category = formData.get('category') as string;
  const title = formData.get('title') as string;
  const description = formData.get('description') as string | null;
  const price = parseInt(formData.get('price') as string || '0', 10);
  const negotiable = formData.get('negotiable') === 'true';
  const location = formData.get('location') as string | null;
  const contact = JSON.parse(formData.get('contact') as string || '[]') as string[];
  const photoFiles = formData.getAll('photos') as File[];

  if (!title) {
    return NextResponse.json({ error: 'title required' }, { status: 400 });
  }
  if (photoFiles.length === 0) {
    return NextResponse.json({ error: 'at least one photo required' }, { status: 400 });
  }

  // Generate listing id upfront so we can use it as the storage path prefix
  const { data: idRow } = await supabase.rpc('gen_random_uuid').single().catch(() => ({ data: null }));
  const listingId = idRow ?? crypto.randomUUID();

  // Upload photos
  const photoUrls: string[] = [];
  for (const file of photoFiles) {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const path = `${listingId}/${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from('listing-photos')
      .upload(path, buffer, { contentType: file.type, upsert: true });
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }
    const { data: urlData } = supabase.storage.from('listing-photos').getPublicUrl(path);
    photoUrls.push(urlData.publicUrl);
  }

  const { data, error } = await supabase
    .from('listings')
    .insert({
      id: listingId,
      seller_id: 'user_alex_park',
      category,
      title,
      description: description || null,
      price: isNaN(price) ? 0 : price,
      negotiable,
      location: location || null,
      contact,
      photo_urls: photoUrls,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ listing: data }, { status: 201 });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/nicole/E-commerce && npx tsc --noEmit 2>&1 | grep -v "popup"
```
Expected: no errors.

---

## Task 6: Create `GET /api/listings/[id]`

**Files:**
- Create: `src/app/api/listings/[id]/route.ts`

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p "/Users/nicole/E-commerce/src/app/api/listings/[id]"
```

Create `/Users/nicole/E-commerce/src/app/api/listings/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json({ listing: data });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/nicole/E-commerce && npx tsc --noEmit 2>&1 | grep -v "popup"
```
Expected: no errors.

---

## Task 7: Update `store.ts` to fetch and create listings via API

**Files:**
- Modify: `src/lib/store.ts`

- [ ] **Step 1: Read the current store**

Read `/Users/nicole/E-commerce/src/lib/store.ts` in full before editing.

- [ ] **Step 2: Add `listingsLoading` state and fetch on mount**

Replace the `useFlipdStore` function. The full new implementation:

```typescript
export function useFlipdStore(): FlipdStore {
  const [listings, setListings] = React.useState<Listing[]>([]);
  const [listingsLoading, setListingsLoading] = React.useState(true);
  const [savedIds, setSavedIds] = React.useState<Set<string>>(() => new Set(['l5', 'l7', 'l2']));
  const [activity, setActivity] = React.useState<ActivityItem[]>(() => DEFAULT_ACTIVITY);

  React.useEffect(() => {
    fetch('/api/listings')
      .then((r) => r.json())
      .then(({ listings: fetched }) => {
        if (Array.isArray(fetched)) setListings(fetched);
      })
      .catch(() => {})
      .finally(() => setListingsLoading(false));
  }, []);

  const isSaved = (id: string) => savedIds.has(id);

  const toggleSave = (id: string) =>
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const addListing = async (formData: FormData): Promise<Listing | null> => {
    const res = await fetch('/api/listings', { method: 'POST', body: formData });
    if (!res.ok) return null;
    const { listing } = await res.json();
    const mapped: Listing = {
      id: listing.id,
      mine: true,
      category: listing.category,
      categoryLabel: CATEGORIES.find((c) => c.id === listing.category)?.label || 'Goods',
      title: listing.title,
      description: listing.description || undefined,
      price: listing.price,
      priceLabel: listing.price > 0 ? '$' + listing.price : 'Free',
      seller: { ...CURRENT_USER },
      meta: listing.location || 'USC · pickup',
      photoTone: 'cream',
      photoLabel: 'photo',
      photo_urls: listing.photo_urls,
      postedLabel: 'just now',
      contactMethod: listing.contact?.[0] || 'instagram',
      isNew: true,
    };
    setListings((prev) => [mapped, ...prev]);
    return mapped;
  };

  const logReveal = (listing: Listing) => {
    setActivity((prev) => [
      {
        id: 'r' + Date.now(),
        dir: 'out',
        who: listing.seller.first || listing.seller.name.split(' ')[0] + '.',
        school: listing.seller.unit,
        listingTitle: listing.title,
        when: 'just now',
        status: 'APPROVED',
        contact:
          listing.contactMethod === 'phone'
            ? '(213) 555-0147'
            : listing.contactMethod === 'email'
            ? (listing.seller.first?.toLowerCase() || 'maya') + '@usc.edu'
            : '@maya.bakes.sc',
      },
      ...prev,
    ]);
  };

  const setActivityStatus = (id: string, status: ActivityStatus) =>
    setActivity((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));

  const myListings = listings.filter((l) => l.mine);
  const savedListings = listings.filter((l) => savedIds.has(l.id));
  const pendingCount = activity.filter((a) => a.dir === 'in' && a.status === 'PENDING').length;

  return {
    CURRENT_USER,
    listings, listingsLoading, savedIds, activity,
    isSaved, toggleSave, addListing, logReveal, setActivityStatus,
    myListings, savedListings, pendingCount,
  };
}
```

- [ ] **Step 3: Update the `FlipdStore` interface**

Replace the `FlipdStore` interface to match:

```typescript
export interface FlipdStore {
  CURRENT_USER: typeof CURRENT_USER;
  listings: Listing[];
  listingsLoading: boolean;
  savedIds: Set<string>;
  activity: ActivityItem[];
  isSaved: (id: string) => boolean;
  toggleSave: (id: string) => void;
  addListing: (formData: FormData) => Promise<Listing | null>;
  logReveal: (listing: Listing) => void;
  setActivityStatus: (id: string, status: ActivityStatus) => void;
  myListings: Listing[];
  savedListings: Listing[];
  pendingCount: number;
}
```

- [ ] **Step 4: Remove MY_SEED from initial listings state**

The `MY_SEED` constant can stay in the file for reference but must NOT be passed to `useState`. The new state starts empty: `React.useState<Listing[]>([])` — already done in Step 2 above.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /Users/nicole/E-commerce && npx tsc --noEmit 2>&1 | grep -v "popup"
```
Expected: no errors.

---

## Task 8: Update `WebCreate` publish to send FormData with real photo Files

**Files:**
- Modify: `src/components/WebApp.tsx` (WebCreate component, ~lines 331–642)

- [ ] **Step 1: Read the current publish function**

Read lines 330–415 of `/Users/nicole/E-commerce/src/components/WebApp.tsx`.

- [ ] **Step 2: Update the `onPublish` prop type and `publish` function**

The `WebCreate` component's `onPublish` prop must change from accepting a plain object to accepting a `FormData`. Update the component signature and `publish` function:

Find this block (around line 331):
```typescript
function WebCreate({
  onPublish, onCancel,
}: { onPublish: (data: { category: string | null; title: string; price: string; negotiable: boolean; meta: string; contact: ContactMethod[]; photoTone: PhotoTone; photoLabel: string; description: string }) => void; onCancel: () => void }) {
```

Replace with:
```typescript
function WebCreate({
  onPublish, onCancel,
}: { onPublish: (formData: FormData) => void; onCancel: () => void }) {
```

Find the `publish` function (around line 404):
```typescript
  const publish = () =>
    onPublish({
      category, title: title || 'Untitled listing', price, negotiable: neg,
      meta: location, contact, photoTone: toneFor(category), photoLabel: 'your photo',
      description,
    });
```

Replace with:
```typescript
  const publish = () => {
    const fd = new FormData();
    fd.append('category', category || 'goods');
    fd.append('title', title || 'Untitled listing');
    fd.append('description', description);
    fd.append('price', price);
    fd.append('negotiable', String(neg));
    fd.append('location', location);
    fd.append('contact', JSON.stringify(contact));
    photos.forEach((p) => fd.append('photos', p.file, p.file.name));
    onPublish(fd);
  };
```

- [ ] **Step 3: Update the `onPublish` call-site in the root `WebApp` component**

Find (around line 870):
```typescript
onPublish={(data) => { store.addListing(data); setView('feed'); setActiveCat('all'); setSort('recent'); }}
```

Replace with:
```typescript
onPublish={async (fd) => { await store.addListing(fd); setView('feed'); setActiveCat('all'); setSort('recent'); }}
```

- [ ] **Step 4: Add loading state to the feed**

In the root `WebApp` component, find where the feed grid renders listings and add a loading indicator. Find the `WebFeed` component call or the feed section. Add `listingsLoading` prop handling:

Find where `WebFeed` is rendered (around line 855):
```typescript
<WebFeed
  store={store} activeCat={activeCat} setActiveCat={setActiveCat}
  ...
```

Add a loading guard just above it (inside the feed view condition):
```typescript
{store.listingsLoading && (
  <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--muted)', fontFamily: 'var(--sans)', fontSize: 13 }}>
    Loading listings…
  </div>
)}
{!store.listingsLoading && (
  <WebFeed
    store={store} activeCat={activeCat} setActiveCat={setActiveCat}
    onListing={onListing} query={query} sort={sort} setSort={setSort}
    priceFilter={priceFilter} setPriceFilter={setPriceFilter}
  />
)}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /Users/nicole/E-commerce && npx tsc --noEmit 2>&1 | grep -v "popup"
```
Expected: no errors.

---

## Task 9: Render real photos in `ListingCard`

**Files:**
- Modify: `src/components/ui.tsx`

- [ ] **Step 1: Read the ListingCard component**

Read lines 136–185 of `/Users/nicole/E-commerce/src/components/ui.tsx`.

- [ ] **Step 2: Replace `<Placeholder>` with `<img>` when `photo_urls[0]` exists**

Find the photo section inside `ListingCard`:
```tsx
      <div style={{ position: 'relative', aspectRatio: '1 / 1' }}>
        <Placeholder label={listing.photoLabel} tone={listing.photoTone} height="100%" radius={0} style={{ position: 'absolute', inset: 0 }} />
```

Replace with:
```tsx
      <div style={{ position: 'relative', aspectRatio: '1 / 1' }}>
        {listing.photo_urls?.[0] ? (
          <img
            src={listing.photo_urls[0]}
            alt={listing.title}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <Placeholder label={listing.photoLabel} tone={listing.photoTone} height="100%" radius={0} style={{ position: 'absolute', inset: 0 }} />
        )}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/nicole/E-commerce && npx tsc --noEmit 2>&1 | grep -v "popup"
```
Expected: no errors.

---

## Task 10: Render real photos in `WebListingDetail`

**Files:**
- Modify: `src/components/WebApp.tsx` (WebListingDetail component, ~lines 255–340)

- [ ] **Step 1: Read the current detail component**

Read lines 255–340 of `/Users/nicole/E-commerce/src/components/WebApp.tsx`.

- [ ] **Step 2: Replace main photo with real image when available**

Find the main photo line:
```tsx
          <Placeholder label={listing.photoLabel} tone={thumbTones[activePhoto % thumbTones.length]} height={460} radius={4} />
```

Replace with:
```tsx
          {listing.photo_urls?.[activePhoto] ? (
            <img
              src={listing.photo_urls[activePhoto]}
              alt={listing.title}
              style={{ width: '100%', height: 460, objectFit: 'cover', borderRadius: 4, display: 'block' }}
            />
          ) : (
            <Placeholder label={listing.photoLabel} tone={thumbTones[activePhoto % thumbTones.length]} height={460} radius={4} />
          )}
```

- [ ] **Step 3: Replace thumbnail strip with real images when available**

Find the thumbnail map:
```tsx
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 8 }}>
            {thumbTones.map((tone, i) => (
              <div key={i} onClick={() => setActivePhoto(i)} style={{ cursor: 'pointer' }}>
                <Placeholder
                  tone={tone}
                  height={84}
                  label={i === 0 ? listing.photoLabel : `+${i}`}
                  style={{ outline: activePhoto === i ? '2px solid var(--cardinal)' : 'none', outlineOffset: activePhoto === i ? -1 : 0 }}
                />
              </div>
            ))}
          </div>
```

Replace with:
```tsx
          {((listing.photo_urls?.length ?? 0) > 1) && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 8 }}>
              {listing.photo_urls!.map((url, i) => (
                <div key={i} onClick={() => setActivePhoto(i)} style={{ cursor: 'pointer', position: 'relative', height: 84, borderRadius: 4, overflow: 'hidden', outline: activePhoto === i ? '2px solid var(--cardinal)' : 'none', outlineOffset: -1 }}>
                  <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ))}
            </div>
          )}
          {!(listing.photo_urls?.length ?? 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 8 }}>
              {thumbTones.map((tone, i) => (
                <div key={i} onClick={() => setActivePhoto(i)} style={{ cursor: 'pointer' }}>
                  <Placeholder
                    tone={tone}
                    height={84}
                    label={i === 0 ? listing.photoLabel : `+${i}`}
                    style={{ outline: activePhoto === i ? '2px solid var(--cardinal)' : 'none', outlineOffset: activePhoto === i ? -1 : 0 }}
                  />
                </div>
              ))}
            </div>
          )}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/nicole/E-commerce && npx tsc --noEmit 2>&1 | grep -v "popup"
```
Expected: no errors.

---

## Task 11: End-to-end smoke test

- [ ] **Step 1: Fill in real Supabase credentials**

Open `.env.local` and replace the placeholder values with real credentials from your Supabase project dashboard (Settings → API).

- [ ] **Step 2: Start the dev server**

```bash
cd /Users/nicole/E-commerce && npm run dev
```

- [ ] **Step 3: Test GET /api/listings**

```bash
curl http://localhost:3000/api/listings
```
Expected: `{"listings":[]}` (empty array, no error).

- [ ] **Step 4: Test the full post flow in browser**

1. Open `http://localhost:3000/feed`
2. Click "Post a listing"
3. Pick a category
4. Fill in title, description, price, location, contact, upload at least one photo
5. Click "Preview listing" then "Publish listing"
6. Confirm the new listing appears at the top of the feed with the real photo

- [ ] **Step 5: Test GET /api/listings/[id]**

Copy the `id` from the listing you just created (visible in the Supabase dashboard → Table Editor → listings), then:

```bash
curl http://localhost:3000/api/listings/<id>
```
Expected: `{"listing":{...}}` with all fields populated.
