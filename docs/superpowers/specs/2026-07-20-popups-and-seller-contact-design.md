# Popups listings & seller contact selection — design

Date: 2026-07-20
Branch: flipd-v1

Two independent changes to Flipd (USC marketplace):

1. **Popups** (the `event` category) drop the price and instead capture an
   event date/time window, and let buyers opt into a "Remind me" the day
   before the event.
2. **Seller contact method** becomes a per-listing multi-select, chosen with
   chips in the posting form, replacing today's read-only "Via email, from
   your profile." text.

The two parts share no code and can be built in either order.

---

## Naming note (read first)

"Popups" is only a **display label**. The underlying category **id is `event`**
(`src/lib/data.ts:12` → `{ id: 'event', label: 'Popups' }`). All logic, DB
values, and conditionals in this spec use `event`, never `popup`/`popups`.

Categories are a multi-select (`categories text[]`, migration `014`). A listing
is treated as a popup when its `categories` array **contains `event`** — "event
wins" over any co-selected category (no price, date/time required).

---

## Part 1 — Popups: event date/time + "Remind me", no price

### Current state

- The posting form (`WebCreate`, `src/components/WebApp.tsx`, from line 917) is
  **fully generic** — no per-category branching exists today. Category only
  affects the AI description prompt.
- Price field: `WebApp.tsx:1289-1307` (input + "Open to offers" toggle), and
  price is **required** via the `missing` validation array (`WebApp.tsx:1038`).
- There is **no date/time field** anywhere — in the form, the `Listing` type,
  or the DB. The only timestamp is `created_at`.
- `Listing.eventPill?: string` (`types.ts:57`) is typed and rendered on the card
  (`ui.tsx:185-188`) but **never written** — a dead field we will reuse.
- The `listings` table columns come from migrations `002`, `014`, `016` (the base
  table only exists in a plan doc, not a migration). `price` is `integer not null
  default 0`.

### Design

**Rule:** `categories.includes('event')` ⇒ popup ⇒ no price, event date/time
required.

#### Posting form (`WebCreate`) — first category-aware branching

- Add a derived `isPopup = categories.includes('event')`.
- When `isPopup`:
  - **Hide** the price block and negotiable toggle (`WebApp.tsx:1289-1307`).
  - **Show a "When" group**: date, start time, end time. All three required.
  - Remove `'a price'` from the `missing` validation; add the three "When"
    fields to it (all required when `isPopup`).
- When not `isPopup`: unchanged (price required as today).
- New form state: `eventDate`, `eventStart`, `eventEnd` (strings from `<input
  type="date">` / `type="time">`).
- `buildFormData()` (`WebApp.tsx:1043-1060`): when `isPopup`, append
  `event_start` and `event_end` (ISO timestamps combined from date + each time)
  and **omit** `price`/`negotiable`; otherwise append `price`/`negotiable` as
  today and omit the event keys.

#### Validation helper (pure, unit-tested)

Add `parseEventWindow(date, start, end)` to `src/lib/validation.ts`, following
the `parseCoords` pattern (dependency-free, returns `null` on invalid rather
than throwing). Returns `{ start: string; end: string } | null` (ISO strings):

- All three parts must be present and parse to valid Date values.
- `end` must be **after** `start`. If `end` time ≤ `start` time on the same
  date, return `null` (do not silently roll to next day — keep it simple; a
  pop-up is same-day).

#### API (`src/app/api/listings/route.ts`, POST)

- Read `event_start`/`event_end` from the form; run `parseEventWindow`.
- If the listing is a popup (`categories` includes `event`):
  - Require a valid event window (400 if missing/invalid).
  - Store `event_start`/`event_end`; store `price = 0` (column stays non-null).
- Else: store `price` as today; leave event columns null.

#### Display

- **Card** (`src/components/ui.tsx`): for event listings, set the (previously
  dead) `eventPill` to a formatted window (e.g. `"Fri, Jul 24 · 7–11pm"`) and
  render it **in place of** the price line. Non-event cards unchanged.
- **Detail** (`priceLine()` in `WebApp.tsx:534-539`, used at 735/775): for event
  listings, render the event window where the price would appear.
- Formatting helper (client-only) formats `{start, end}` → label. Same-day
  windows collapse to one date + a time range.

#### Buyer "Remind me"

- **Button on the popup's detail page** (near the existing Save button,
  `WebApp.tsx:605-606`). Toggles an opt-in reminder for the current buyer.
- **New table `popup_reminders`**, mirroring `saves`
  (`003_saves_per_user.sql`): `(user_id uuid, listing_id uuid, created_at
  timestamptz default now())`, PK `(user_id, listing_id)`, RLS per user.
- **New route `/api/popup-reminders`** (POST toggle / DELETE), mirroring
  `/api/saves`.
- **Store**: add `isReminded(listingId)` / `toggleReminder(listingId)` and a
  `popupReminders` set, mirroring `isSaved`/`toggleSave`/`savedListings`
  (`store.ts:155-157, 244-266`).
- **Cron**: the existing hourly reminder cron (migration `009`, `reminderEmail`
  in `notify.ts`) gains a query: for popups whose `event_start` is within the
  next ~24h and `reminded_at is null`, email each opted-in buyer once, then set
  `popup_reminders.reminded_at = now()` for those rows. Reuse the notify layer.
  The `reminded_at` column (in the migration below) makes each buyer emailed at
  most once per popup.

#### DB migration (new)

```sql
-- listings event window (popups)
alter table public.listings
  add column if not exists event_start timestamptz,
  add column if not exists event_end   timestamptz;

-- buyer opt-in reminders for popup events (mirrors saves)
create table if not exists public.popup_reminders (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  listing_id  uuid not null references public.listings(id) on delete cascade,
  reminded_at timestamptz,
  created_at  timestamptz not null default now(),
  primary key (user_id, listing_id)
);
-- RLS: a user sees/writes only their own rows (mirror saves policies).
```

### Part 1 — out of scope (YAGNI)

- No multi-day / recurring events. One same-day window per popup.
- No time-zone picker (assume campus-local, as the rest of the app does).
- No reminder for saved-but-not-reminded listings; "Remind me" is its own
  explicit opt-in.

---

## Part 2 — Per-listing contact method chips

### Current state

- Posting form "How buyers reach you" (`WebApp.tsx:1315-1322`) is **read-only
  text** ("Via {method}, from your profile.").
- The listing's `contact` (`text[]`) is derived server-side by wrapping the
  profile's single `contact_method` in a one-element array
  (`api/listings/route.ts:69-75`).
- `profiles.contact_method` is a single `text` CHECK column
  (`007_identity_contact.sql`), auto-picked by `primaryMethod()`
  (`validation.ts:44-47`) and written from profile edit
  (`profile/edit/page.tsx:78`).
- Per-channel values live in `profiles.contact_instagram/phone/email`.
- `resolveSharedContact(chosen, values)` (`validation.ts:36-42`) already
  intersects a chosen list with stored values — ready for a real multi-select.
- `listings.contact` is already `text[]` — **no migration needed** for Part 2.

### Design

**Goal:** the seller picks, per listing, which of their filled contact methods
buyers may use — via chips in the posting form.

#### Posting form (`WebCreate`) — replace the read-only text

- Compute `availableMethods` = the methods the seller has a **value** for in
  their profile (`contact_instagram/phone/email`).
- Render a **chip per available method** (unfilled methods show **no chip**).
  Reuse `CONTACT_METHOD_ICONS` / `CONTACT_METHOD_LABELS` (already used in
  `RevealModal`, `WebApp.tsx:1571-1572`) for consistent look.
- Multi-select; **all available methods pre-selected** by default. Seller can
  deselect; **at least one must remain selected** (mirrors `RevealModal`'s
  `canShare >= 1`).
- If the seller has **no** filled methods: keep today's fallback text ("Add a
  contact method in your profile first.") and the existing publish-gate.
- New form state `contactMethods: string[]`; `buildFormData()` appends it.

#### API (`api/listings/route.ts`, POST)

- Build `listings.contact` from the **submitted** `contactMethods`, intersected
  with the methods the profile actually has values for (never store a method
  with no value). Reuse the same intersection idea as `resolveSharedContact`.
- Fallback: if the form sends nothing, derive from all filled profile values
  (so old clients / edge cases still produce a valid non-empty contact).

#### Profile edit form

- Visually unchanged (three value inputs under "How buyers reach you").
- Remove the `primaryMethod(...)` call and stop sending `contact_method`
  (`profile/edit/page.tsx:78`). The listing now carries the per-listing choice.

#### Reveal approval

- Unchanged. `resolveSharedContact(listing.contact, sellerValues)` already
  shares exactly the listing's chosen methods that have stored values. The
  seller shares **all filled** methods that the listing selected.

#### Client model cleanup

- `Listing.contactMethod?: ContactMethod` (singular, `types.ts:59`) and the
  `store.ts:112` mapping that reads only `row.contact?.[0]` become a **list**
  (`contactMethods: ContactMethod[]`). Update any detail rendering that shows
  the seller's contact method to render **all** selected methods.
- Delete `primaryMethod()` and its import once unused.

#### Legacy column

- **Leave `profiles.contact_method` in the DB** (non-destructive); stop reading
  and writing it. No migration to drop it.

### Part 2 — out of scope (YAGNI)

- No per-listing storage of contact **values** (values stay on the profile;
  only the *selection* is per-listing).
- No new explicit "expose this method" checkboxes in the profile — filled =
  available; the posting form is where per-listing selection happens.

---

## Testing

- **`validation.ts`** (pure, no imports): unit-test `parseEventWindow`
  (valid window, missing parts, end ≤ start, non-numeric) alongside the existing
  `parseCoords` tests. Confirm `resolveSharedContact` still behaves with
  multi-element `chosen`.
- **API**: a popup POST without an event window → 400; a popup POST stores the
  window and `price = 0`; a non-popup POST still requires price. Contact is
  built from submitted chips ∩ profile values; empty submission falls back to
  all filled.
- **Cron**: a popup with `event_start` ~24h out and an opted-in buyer produces
  one reminder; a second cron run does not re-send.
- **UI (manual / via /verify)**: posting form swaps price↔When when `event` is
  toggled; contact chips appear only for filled methods, pre-selected, enforce
  ≥1; card/detail show the event window instead of price; buyer "Remind me"
  toggles.

## Migrations summary

- **New migration** (Part 1): add `listings.event_start`, `listings.event_end`;
  create `popup_reminders` table + RLS.
- **No migration** for Part 2 (`listings.contact` is already `text[]`;
  `profiles.contact_method` is left in place, unused).
