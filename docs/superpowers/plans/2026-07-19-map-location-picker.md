# Map-Based Location Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Google-Maps location picker to the posting form (search + draggable pin, reverse-geocode autofills the place name) and a static map + "Open in Google Maps" link on the listing detail page, storing exact coordinates.

**Architecture:** Additive `lat`/`lng`/`place_name` columns on `listings`; the existing `location` text column is preserved as the display label. A pure coordinate-validation helper (unit-tested) gates persistence. A lazily-loaded Google Maps script powers a self-contained `<LocationPicker>` on the form; the detail page uses a Google Static Maps image (no live map). Null coordinates → today's plain-text fallback everywhere.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Supabase (Postgres), Vitest (node env), Google Maps JavaScript API + Places + Static Maps, inline-styled React.

## Global Constraints

- App is "Flipd" — never "Tassel". No emojis; SVG `<Icon>` only.
- No wizards, no stacked delight, terse labels, ONE validation surface per form.
- `src/lib/validation.ts` stays dependency-free (no imports) — the coordinate helper goes there.
- Reuse existing style classes (`field`, `field-label`, chip button styles). No new styling system.
- Google Maps script loads lazily (post form + detail only), never app-wide.
- Env key: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (client-exposed). The user provisions it; the feature degrades to plain text when absent.
- Coordinates are validated: lat `-90..90`, lng `-180..180`, both finite; invalid → BOTH null. Invalid coordinates NEVER reject a post — `location` text still persists.
- Migrations are sequential SQL files in `supabase/migrations/`; next number is `016`.
- Tests: Vitest, `src/**/*.test.ts`, node env. Run with `npm test`.

---

### Task 1: Coordinate helpers (pure, tested)

**Files:**
- Modify: `src/lib/validation.ts`
- Test: `src/lib/validation.test.ts`

**Interfaces:**
- Produces: `parseCoords(latRaw: unknown, lngRaw: unknown): { lat: number; lng: number } | null` — returns the pair only if both parse to finite numbers in range (lat -90..90, lng -180..180); otherwise null.
- Produces: `CAMPUS_SPOTS: ReadonlyArray<{ name: string; lat: number; lng: number }>` — the ~6 known campus meetup spots with coordinates.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/validation.test.ts`:

```typescript
import { parseCoords, CAMPUS_SPOTS } from './validation';

describe('parseCoords', () => {
  it('accepts a valid in-range pair (numbers or numeric strings)', () => {
    expect(parseCoords(34.0224, -118.2851)).toEqual({ lat: 34.0224, lng: -118.2851 });
    expect(parseCoords('34.0224', '-118.2851')).toEqual({ lat: 34.0224, lng: -118.2851 });
  });
  it('rejects out-of-range values', () => {
    expect(parseCoords(91, 0)).toBeNull();
    expect(parseCoords(0, 181)).toBeNull();
    expect(parseCoords(-91, 0)).toBeNull();
  });
  it('rejects when either is missing or non-numeric', () => {
    expect(parseCoords(34.02, null)).toBeNull();
    expect(parseCoords(undefined, -118.28)).toBeNull();
    expect(parseCoords('abc', '-118.28')).toBeNull();
    expect(parseCoords('', '')).toBeNull();
  });
  it('rejects NaN/Infinity', () => {
    expect(parseCoords(NaN, 0)).toBeNull();
    expect(parseCoords(0, Infinity)).toBeNull();
  });
});

describe('CAMPUS_SPOTS', () => {
  it('has the six known campus meetup spots with valid coordinates', () => {
    const names = CAMPUS_SPOTS.map((s) => s.name);
    expect(names).toEqual(['USC Village', 'Leavey Library', 'Tutor Campus Center', 'Trousdale Pkwy', 'The Lorenzo', 'Cardinal Gardens']);
    for (const s of CAMPUS_SPOTS) {
      expect(parseCoords(s.lat, s.lng)).toEqual({ lat: s.lat, lng: s.lng });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/validation.test.ts`
Expected: FAIL — `parseCoords is not a function` / `CAMPUS_SPOTS is not defined`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/validation.ts`:

```typescript
// Coordinates: both must be finite and in geographic range, else null (never
// a partial pair). Accepts numbers or numeric strings (form-data values).
export function parseCoords(latRaw: unknown, lngRaw: unknown): { lat: number; lng: number } | null {
  const lat = typeof latRaw === 'number' ? latRaw : Number(latRaw);
  const lng = typeof lngRaw === 'number' ? lngRaw : Number(lngRaw);
  if (latRaw === null || latRaw === undefined || latRaw === '') return null;
  if (lngRaw === null || lngRaw === undefined || lngRaw === '') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

// Known campus meetup spots (chip shortcuts drop the pin here).
export const CAMPUS_SPOTS: ReadonlyArray<{ name: string; lat: number; lng: number }> = [
  { name: 'USC Village', lat: 34.0259, lng: -118.2851 },
  { name: 'Leavey Library', lat: 34.0217, lng: -118.2828 },
  { name: 'Tutor Campus Center', lat: 34.0205, lng: -118.2860 },
  { name: 'Trousdale Pkwy', lat: 34.0206, lng: -118.2855 },
  { name: 'The Lorenzo', lat: 34.0197, lng: -118.2776 },
  { name: 'Cardinal Gardens', lat: 34.0250, lng: -118.2905 },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/validation.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation.ts src/lib/validation.test.ts
git commit -m "feat: parseCoords + CAMPUS_SPOTS coordinate helpers"
```

---

### Task 2: Migration — listing coordinates

**Files:**
- Create: `supabase/migrations/016_listing_coordinates.sql`

**Interfaces:**
- Produces: `listings.lat double precision`, `listings.lng double precision`, `listings.place_name text` (all nullable).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/016_listing_coordinates.sql`:

```sql
-- Exact map coordinates + human place name for a listing's pickup spot.
-- All nullable: old listings and text-only entries have no map.
alter table public.listings
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists place_name text;
```

- [ ] **Step 2: Apply the migration**

Apply via the Supabase MCP `apply_migration` tool (name: `016_listing_coordinates`, SQL above). (Controller applies this against the live DB; a subagent without MCP access should report BLOCKED so the controller runs it.)
Expected: success.

- [ ] **Step 3: Verify columns exist**

MCP `execute_sql`:
```sql
select column_name, data_type from information_schema.columns
where table_name = 'listings' and column_name in ('lat','lng','place_name') order by column_name;
```
Expected: three rows — `lat | double precision`, `lng | double precision`, `place_name | text`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/016_listing_coordinates.sql
git commit -m "feat: add listings lat/lng/place_name columns"
```

---

### Task 3: Types — carry coordinates through the model

**Files:**
- Modify: `src/lib/types.ts` (`Listing` ~33-58)
- Modify: `src/lib/store.ts` (DbListing row type ~24-36; `mapDbListing` ~92-108)

**Interfaces:**
- Consumes: nothing.
- Produces: `Listing` gains `lat?: number | null; lng?: number | null; placeName?: string | null;`. `mapDbListing` populates them from the row.

- [ ] **Step 1: Extend the Listing type**

In `src/lib/types.ts`, inside `interface Listing` (after `meta: string;`), add:
```typescript
  lat?: number | null;
  lng?: number | null;
  placeName?: string | null;
```

- [ ] **Step 2: Extend the DB-row type**

In `src/lib/store.ts`, in the `DbListing` type (near `location?: string | null;`), add:
```typescript
  lat?: number | null;
  lng?: number | null;
  place_name?: string | null;
```

- [ ] **Step 3: Populate in mapDbListing**

In `src/lib/store.ts` `mapDbListing`, in the returned object (after `meta: row.location || 'USC · pickup',`), add:
```typescript
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    placeName: row.place_name ?? null,
```

- [ ] **Step 4: Verify compile**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/store.ts
git commit -m "feat: carry lat/lng/placeName through Listing + mapDbListing"
```

---

### Task 4: API — persist coordinates (POST + PATCH)

**Files:**
- Modify: `src/app/api/listings/route.ts` (POST — parse ~65, insert ~110)
- Modify: `src/app/api/listings/[id]/route.ts` (PATCH multipart — parse ~74, update ~115)

**Interfaces:**
- Consumes: `parseCoords` (Task 1).
- Produces: both routes accept form fields `lat`, `lng`, `place_name`; persist validated coords (or null) + place_name. `SELLER_JOIN` already uses `*`, so reads include the new columns automatically.

- [ ] **Step 1: POST — parse and persist**

In `src/app/api/listings/route.ts`, import the helper (top of file):
```typescript
import { parseCoords } from '@/lib/validation';
```
After the `location` parse line, add:
```typescript
  const coords = parseCoords(formData.get('lat'), formData.get('lng'));
  const placeName = ((formData.get('place_name') as string | null) || '').trim() || null;
```
In the `.insert({ ... })` object (after `location: location || null,`), add:
```typescript
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      place_name: placeName,
```

- [ ] **Step 2: PATCH — parse and persist**

In `src/app/api/listings/[id]/route.ts`, import `parseCoords` the same way, and in the multipart branch mirror Step 1: parse `coords`/`placeName` near the `location` parse, and add the same three fields to the `.update({ ... })` object (after `location: location || null`).

- [ ] **Step 3: Verify compile + manual persist check**

Run: `npx tsc --noEmit` → exit 0.
Then (after the form task, or via a direct DB check) confirm a posted listing with coordinates has non-null `lat/lng/place_name`, and one without has nulls:
```sql
select lat, lng, place_name, location from listings order by created_at desc limit 3;
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/listings/route.ts src/app/api/listings/[id]/route.ts
git commit -m "feat: listings API persists validated lat/lng/place_name"
```

---

### Task 5: Google Maps loader hook

A tiny hook that lazily injects the Google Maps JS API (with `places`) once and reports readiness. Used by the form picker. Isolated so the picker and any future map consumer share one loader.

**Files:**
- Create: `src/lib/useGoogleMaps.ts`

**Interfaces:**
- Produces: `useGoogleMaps(): 'unconfigured' | 'loading' | 'ready' | 'error'` — `'unconfigured'` when `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is unset (caller shows the plain-text fallback); `'ready'` when `window.google.maps` is available.

- [ ] **Step 1: Write the loader hook**

Create `src/lib/useGoogleMaps.ts`:

```typescript
'use client';
import { useEffect, useState } from 'react';

type Status = 'unconfigured' | 'loading' | 'ready' | 'error';
const SRC_ID = 'gmaps-js';

export function useGoogleMaps(): Status {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [status, setStatus] = useState<Status>(key ? 'loading' : 'unconfigured');

  useEffect(() => {
    if (!key) { setStatus('unconfigured'); return; }
    // Already loaded.
    if (typeof window !== 'undefined' && (window as unknown as { google?: { maps?: unknown } }).google?.maps) {
      setStatus('ready');
      return;
    }
    let script = document.getElementById(SRC_ID) as HTMLScriptElement | null;
    const onLoad = () => setStatus('ready');
    const onErr = () => setStatus('error');
    if (!script) {
      script = document.createElement('script');
      script.id = SRC_ID;
      script.async = true;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places`;
      script.addEventListener('load', onLoad);
      script.addEventListener('error', onErr);
      document.head.appendChild(script);
    } else {
      script.addEventListener('load', onLoad);
      script.addEventListener('error', onErr);
      if ((window as unknown as { google?: { maps?: unknown } }).google?.maps) setStatus('ready');
    }
    return () => {
      script?.removeEventListener('load', onLoad);
      script?.removeEventListener('error', onErr);
    };
  }, [key]);

  return status;
}
```

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/useGoogleMaps.ts
git commit -m "feat: lazy Google Maps JS loader hook"
```

---

### Task 6: LocationPicker component

Self-contained picker: search box (Places Autocomplete), interactive map with a draggable pin, reverse-geocode-driven autofill, campus chips as shortcuts, and a plain-text fallback when maps are unavailable.

**Files:**
- Create: `src/components/LocationPicker.tsx`

**Interfaces:**
- Consumes: `useGoogleMaps` (Task 5), `CAMPUS_SPOTS` (Task 1).
- Produces: `LocationPicker` component with props:
  ```typescript
  { value: { name: string; lat: number | null; lng: number | null };
    onChange: (v: { name: string; lat: number | null; lng: number | null }) => void; }
  ```

- [ ] **Step 1: Write the component**

Create `src/components/LocationPicker.tsx`:

```typescript
'use client';
import React from 'react';
import { useGoogleMaps } from '@/lib/useGoogleMaps';
import { CAMPUS_SPOTS } from '@/lib/validation';

const USC = { lat: 34.0224, lng: -118.2851 };

type Value = { name: string; lat: number | null; lng: number | null };

export function LocationPicker({ value, onChange }: { value: Value; onChange: (v: Value) => void }) {
  const status = useGoogleMaps();
  const mapRef = React.useRef<HTMLDivElement | null>(null);
  const searchRef = React.useRef<HTMLInputElement | null>(null);
  const gmap = React.useRef<google.maps.Map | null>(null);
  const marker = React.useRef<google.maps.Marker | null>(null);
  const geocoder = React.useRef<google.maps.Geocoder | null>(null);

  // Keep the latest onChange without re-running the map init effect.
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  const reverseGeocode = React.useCallback((lat: number, lng: number) => {
    if (!geocoder.current) return;
    geocoder.current.geocode({ location: { lat, lng } }, (results, gStatus) => {
      const name = gStatus === 'OK' && results && results[0]
        ? (results[0].address_components?.find((c) => c.types.includes('point_of_interest'))?.long_name
           || results[0].formatted_address)
        : '';
      onChangeRef.current({ name: name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng });
    });
  }, []);

  const placePin = React.useCallback((lat: number, lng: number) => {
    if (!gmap.current) return;
    if (!marker.current) {
      marker.current = new google.maps.Marker({ map: gmap.current, draggable: true, position: { lat, lng } });
      marker.current.addListener('dragend', () => {
        const p = marker.current!.getPosition();
        if (p) reverseGeocode(p.lat(), p.lng());
      });
    } else {
      marker.current.setPosition({ lat, lng });
    }
    gmap.current.panTo({ lat, lng });
  }, [reverseGeocode]);

  // Initialize map + autocomplete once ready.
  React.useEffect(() => {
    if (status !== 'ready' || !mapRef.current) return;
    geocoder.current = new google.maps.Geocoder();
    const center = value.lat != null && value.lng != null ? { lat: value.lat, lng: value.lng } : USC;
    gmap.current = new google.maps.Map(mapRef.current, { center, zoom: 15, disableDefaultUI: true, zoomControl: true });
    gmap.current.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (e.latLng) { placePin(e.latLng.lat(), e.latLng.lng()); reverseGeocode(e.latLng.lat(), e.latLng.lng()); }
    });
    if (value.lat != null && value.lng != null) placePin(value.lat, value.lng);

    if (searchRef.current) {
      const ac = new google.maps.places.Autocomplete(searchRef.current, { fields: ['geometry', 'name', 'formatted_address'] });
      ac.bindTo('bounds', gmap.current);
      ac.addListener('place_changed', () => {
        const place = ac.getPlace();
        const loc = place.geometry?.location;
        if (loc) {
          placePin(loc.lat(), loc.lng());
          onChangeRef.current({ name: place.name || place.formatted_address || '', lat: loc.lat(), lng: loc.lng() });
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const pickChip = (spot: { name: string; lat: number; lng: number }) => {
    if (status === 'ready') placePin(spot.lat, spot.lng);
    onChange({ name: spot.name, lat: spot.lat, lng: spot.lng });
  };

  // Fallback: no key / load error → chips + plain text (today's behavior).
  if (status === 'unconfigured' || status === 'error') {
    return (
      <div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {CAMPUS_SPOTS.map((s) => (
            <button key={s.name} type="button" onClick={() => onChange({ name: s.name, lat: s.lat, lng: s.lng })}
              style={chipStyle(value.name === s.name)}>{s.name}</button>
          ))}
        </div>
        <input value={value.name} onChange={(e) => onChange({ name: e.target.value, lat: null, lng: null })}
          placeholder="Type a spot on or near campus" className="field" />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {CAMPUS_SPOTS.map((s) => (
          <button key={s.name} type="button" onClick={() => pickChip(s)} style={chipStyle(value.name === s.name)}>{s.name}</button>
        ))}
      </div>
      <input ref={searchRef} placeholder="Search a place (e.g. Trader Joe's)" className="field" style={{ marginBottom: 10 }} />
      <div ref={mapRef} style={{ width: '100%', height: 220, borderRadius: 12, overflow: 'hidden', background: 'var(--surface)', marginBottom: 10 }} />
      <input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })}
        placeholder="Place name" className="field" />
    </div>
  );
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: '7px 14px', borderRadius: 'var(--r-pill)',
    border: '1px solid ' + (active ? 'var(--ink)' : 'var(--rule)'),
    background: active ? 'var(--ink)' : '#fff', color: active ? '#fff' : 'var(--ink-2)',
    fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
  };
}
```

- [ ] **Step 2: Install Google Maps types (dev-only)**

Run: `npm install -D @types/google.maps`
(Provides the `google.maps.*` types used above. If the install is unavailable, replace the typed refs with `any` and note it — but prefer the types.)

- [ ] **Step 3: Verify compile**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/LocationPicker.tsx package.json package-lock.json
git commit -m "feat: LocationPicker — search + draggable pin + chip shortcuts + fallback"
```

---

### Task 7: Wire LocationPicker into the posting form

Replace the chips + text input in `WebCreate` with `<LocationPicker>`, add coordinate state, and send the new fields on submit.

**Files:**
- Modify: `src/components/WebApp.tsx` (`WebCreate` — state ~900, location JSX ~1274-1287, submit `fd.append`s ~1020)

**Interfaces:**
- Consumes: `LocationPicker` (Task 6).
- Produces: form sends `location`, `lat`, `lng`, `place_name` form fields.

- [ ] **Step 1: Add coordinate state, seeded from `initial` (edit mode)**

In `src/components/WebApp.tsx`, import at top: `import { LocationPicker } from './LocationPicker';`
Replace the `location` state line (~900) with a single location object seeded from `initial`:
```typescript
  const [loc, setLoc] = React.useState<{ name: string; lat: number | null; lng: number | null }>(() => ({
    name: initial?.placeName ?? (initial?.meta && initial.meta !== 'USC · pickup' ? initial.meta : ''),
    lat: initial?.lat ?? null,
    lng: initial?.lng ?? null,
  }));
```

- [ ] **Step 2: Replace the location JSX**

Replace the label + chips + input block (~1274-1287) with:
```tsx
              <label className="field-label">Where you&apos;ll meet<span style={{ color: 'var(--accent)' }}> *</span></label>
              <div style={{ marginBottom: 22 }}>
                <LocationPicker value={loc} onChange={setLoc} />
              </div>
```

- [ ] **Step 3: Update validation + submit**

Find the validation entry for location (`!location.trim() && 'a pickup location'`, ~1008) and change to `!loc.name.trim() && 'a pickup location'`.
Replace `fd.append('location', location);` (~1020) with:
```typescript
    fd.append('location', loc.name);
    fd.append('place_name', loc.name);
    if (loc.lat != null && loc.lng != null) { fd.append('lat', String(loc.lat)); fd.append('lng', String(loc.lng)); }
```
Also update the preview object that maps location to `meta` (search for where `location` was used to build the preview `Listing`, ~1058) to use `loc.name`, and set `lat: loc.lat, lng: loc.lng, placeName: loc.name` on the preview object so the live preview matches.

- [ ] **Step 4: Verify compile + render**

Run: `npx tsc --noEmit` → exit 0.
Run `npm run dev`, open `/post`, confirm the picker renders (or the plain-text fallback if no API key is set) and the rest of the form still submits. Don't leave a server running.

- [ ] **Step 5: Commit**

```bash
git add src/components/WebApp.tsx
git commit -m "feat: LocationPicker in posting form + coordinate submit"
```

---

### Task 8: Detail-page map + "Open in Google Maps"

Replace the plain-text "Pickup at …" block with a static map + link when the listing has coordinates; keep plain text otherwise.

**Files:**
- Modify: `src/components/WebApp.tsx` (`WebListingDetail` `titleBlock` ~622-631)

**Interfaces:**
- Consumes: `Listing.lat/lng/placeName` (Task 3), `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.

- [ ] **Step 1: Replace the location block**

In `src/components/WebApp.tsx`, replace the `listing.meta && (...)` location line inside `titleBlock` (~624-630) with a conditional:
```tsx
    {listing.lat != null && listing.lng != null ? (
      <div style={{ marginBottom: 16 }}>
        <div style={{ color: 'var(--muted)', fontFamily: 'var(--sans)', fontSize: 14, marginBottom: 8 }}>
          Pickup at {listing.placeName || listing.meta.split(' · ')[0]}
        </div>
        {process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY && (
          <a href={`https://www.google.com/maps/search/?api=1&query=${listing.lat},${listing.lng}`}
            target="_blank" rel="noreferrer"
            style={{ display: 'block', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--rule)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt={`Map showing ${listing.placeName || 'the pickup location'}`}
              src={`https://maps.googleapis.com/maps/api/staticmap?center=${listing.lat},${listing.lng}&zoom=16&size=600x240&scale=2&markers=color:red%7C${listing.lat},${listing.lng}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`}
              style={{ width: '100%', height: 'auto', display: 'block' }} />
          </a>
        )}
        <a href={`https://www.google.com/maps/search/?api=1&query=${listing.lat},${listing.lng}`}
          target="_blank" rel="noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, color: 'var(--ink)', fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>
          <Icon name="mapPin" size={14} color="var(--ink)" /> Open in Google Maps
        </a>
      </div>
    ) : listing.meta && (
      <div style={{ color: 'var(--muted)', fontFamily: 'var(--sans)', fontSize: 14, marginBottom: 16 }}>
        Pickup at {listing.meta.split(' · ')[0]}
      </div>
    )}
```

- [ ] **Step 2: Confirm the `mapPin` icon**

The `mapPin` icon already exists in `src/components/Icon.tsx` (verified) — the JSX above uses it as-is. No icon change needed; do NOT introduce an emoji. (This step is a no-op confirmation; if for any reason `mapPin` is missing, add a standard map-pin SVG path under that exact name.)

- [ ] **Step 3: Verify compile + render**

Run: `npx tsc --noEmit` → exit 0.
With a listing that has coordinates, load its detail page: confirm the static map renders (with API key) and "Open in Google Maps" opens the right pin. With a coordinate-less listing, confirm plain-text "Pickup at …" still shows.

- [ ] **Step 4: Commit**

```bash
git add src/components/WebApp.tsx
git commit -m "feat: detail-page static map + Open in Google Maps link"
```

---

### Task 9: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Drive the full flow**

Use the `verify` skill. With `npm run dev` and (if available) a real `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`:
1. Post a listing: search "Trader Joe's" (or drop a pin) → confirm the place-name field autofills; submit.
2. Load the new listing's detail page → confirm the static map shows the pin, place name reads correctly, and "Open in Google Maps" opens `.../maps/search/?api=1&query=<lat>,<lng>`.
3. Post a second listing with NO pin (type-only) → confirm it saves and the detail page shows plain-text "Pickup at …" with no map.
4. DB check: `select lat, lng, place_name, location from listings order by created_at desc limit 2;` — pinned row has coords + place_name; typed row has null coords.

**If no API key is available in the environment:** verify the fallback path instead — the form renders chips + text input, posting works, coordinates persist as null, and the detail page shows plain text. Note in the report that the map-rendering path was not exercised live (key required) and was verified structurally.

- [ ] **Step 2: Record results**

No commit (verification only). Report what was driven and observed.

---

## Self-Review

**Spec coverage:**
- Provider/env key → Global Constraints + Tasks 5, 8. ✓
- Section 1 (lat/lng/place_name columns, location preserved, null → no map) → Tasks 2, 3. ✓
- Section 2 (search + draggable pin + retained chips, autofill-but-editable name, fallback) → Tasks 6, 7. ✓
- Section 3 (API parse/validate/persist, static map + Open-in-Google-Maps on detail, tests) → Tasks 1, 4, 8, 9. ✓
- Invalid coords never reject post → Task 4 (parseCoords → null, location still persists). ✓
- Out-of-scope (live detail map, proximity search, rounding, provider abstraction) → not planned. ✓

**Placeholder scan:** No TBD/TODO. Every code step shows real code. Task 8 Step 2 conditionally adds an icon — the condition and the no-emoji rule are explicit, not a placeholder.

**Type consistency:** `parseCoords(latRaw, lngRaw) → {lat,lng}|null` and `CAMPUS_SPOTS` consistent across Tasks 1, 4, 6. `Listing.lat/lng/placeName` (camelCase, client) vs `lat/lng/place_name` (snake_case, DB/form) used consistently per layer. `LocationPicker` `value`/`onChange` shape `{ name, lat, lng }` consistent between Tasks 6 and 7. `useGoogleMaps()` status union consistent between Tasks 5 and 6.

**Ordering note:** Task 2 (migration) must be applied before Tasks 4/9 run against the live DB; code for 3–8 can be written independent of the migration being live.
