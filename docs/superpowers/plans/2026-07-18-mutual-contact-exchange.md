# Mutual Contact Exchange Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On reveal approval, share **both** parties' chosen contact methods (today only the seller's is shared, to the buyer), moving to a multi-contact model where each side picks which methods to share per transaction.

**Architecture:** Extract the existing inline "offered ∩ stored" contact resolution from `toDto` into a pure, unit-tested helper in `validation.ts`, then apply it symmetrically for both buyer and seller. Add a `buyer_contact text[]` column to `reveal_requests` (mirror of `listings.contact`). Onboarding/profile move from single-method to multi-method input; the reveal modal gains a buyer method-picker.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Supabase (Postgres + auth), Vitest (node env), inline-styled React components.

## Global Constraints

- Brand: app is "Flipd" in all UI copy, never "Tassel". No emojis; SVG icons only (`<Icon name=... />`).
- UX restraint: no wizards, no stacked delight patterns, terse labels, one validation surface per form.
- Contact methods are exactly: `'instagram' | 'phone' | 'email'`. Labels: Instagram / Text / Email.
- `validation.ts` must stay dependency-free (no imports) — it is the pure unit-test surface.
- Tests: Vitest, `src/**/*.test.ts`, node environment. Run with `npm test`.
- Never trust client-supplied contact-method lists — the server validates against stored profile values.
- Contact is exposed ONLY when status ∈ {approved, completed}; never for pending/declined/expired.
- Migrations are sequential SQL files in `supabase/migrations/`; next number is `015`.

---

### Task 1: Contact-resolution helper (pure, tested)

Extract the "which methods to actually share" logic into `validation.ts` so both buyer and seller sides (API + email) reuse one tested function.

**Files:**
- Modify: `src/lib/validation.ts`
- Test: `src/lib/validation.test.ts`

**Interfaces:**
- Produces: `resolveSharedContact(chosen: string[], values: { instagram: string | null; phone: string | null; email: string | null }): { instagram?: string; phone?: string; email?: string }` — returns only methods that are BOTH in `chosen` AND have a non-empty stored value.
- Produces: `primaryMethod(values: {...}): 'instagram' | 'phone' | 'email' | null` — first present method in order instagram > phone > email, else null.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/validation.test.ts`:

```typescript
import { resolveSharedContact, primaryMethod } from './validation';

describe('resolveSharedContact', () => {
  const values = { instagram: '@trojan', phone: '2135550100', email: 't@usc.edu' };
  it('returns only chosen methods that have a stored value', () => {
    expect(resolveSharedContact(['instagram', 'email'], values)).toEqual({ instagram: '@trojan', email: 't@usc.edu' });
  });
  it('drops chosen methods with no stored value', () => {
    expect(resolveSharedContact(['phone'], { instagram: '@t', phone: null, email: null })).toEqual({});
  });
  it('ignores stored values not chosen', () => {
    expect(resolveSharedContact(['instagram'], values)).toEqual({ instagram: '@trojan' });
  });
  it('returns empty for empty chosen list', () => {
    expect(resolveSharedContact([], values)).toEqual({});
  });
});

describe('primaryMethod', () => {
  it('prefers instagram, then phone, then email', () => {
    expect(primaryMethod({ instagram: '@t', phone: '1', email: 'e' })).toBe('instagram');
    expect(primaryMethod({ instagram: null, phone: '1', email: 'e' })).toBe('phone');
    expect(primaryMethod({ instagram: null, phone: null, email: 'e' })).toBe('email');
    expect(primaryMethod({ instagram: null, phone: null, email: null })).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/validation.test.ts`
Expected: FAIL — `resolveSharedContact is not a function` / `primaryMethod is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/validation.ts`:

```typescript
type ContactValues = { instagram: string | null; phone: string | null; email: string | null };
export type ContactMethod = 'instagram' | 'phone' | 'email';
const METHOD_ORDER: ContactMethod[] = ['instagram', 'phone', 'email'];

// The methods actually shared = chosen ∩ (methods with a stored value).
export function resolveSharedContact(chosen: string[], values: ContactValues): Partial<Record<ContactMethod, string>> {
  const out: Partial<Record<ContactMethod, string>> = {};
  for (const m of METHOD_ORDER) {
    if (chosen.includes(m) && values[m]) out[m] = values[m] as string;
  }
  return out;
}

// First present method in priority order — used as the legacy "primary" hint.
export function primaryMethod(values: ContactValues): ContactMethod | null {
  return METHOD_ORDER.find((m) => Boolean(values[m])) ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/validation.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation.ts src/lib/validation.test.ts
git commit -m "feat: resolveSharedContact + primaryMethod helpers"
```

---

### Task 2: Migration — `reveal_requests.buyer_contact`

**Files:**
- Create: `supabase/migrations/015_buyer_contact.sql`

**Interfaces:**
- Produces: column `reveal_requests.buyer_contact text[]` (nullable, defaults `'{}'`).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/015_buyer_contact.sql`:

```sql
-- Buyer's per-request choice of which contact methods to share on approval.
-- Mirror of listings.contact (text[]) for the seller side.
alter table public.reveal_requests
  add column if not exists buyer_contact text[] not null default '{}';
```

- [ ] **Step 2: Apply the migration**

Apply via the Supabase MCP `apply_migration` tool (name: `015_buyer_contact`, the SQL above), OR if using local CLI: `supabase db push`.
Expected: success, no error.

- [ ] **Step 3: Verify the column exists**

Run a query (MCP `execute_sql` or psql):
```sql
select column_name, data_type from information_schema.columns
where table_name = 'reveal_requests' and column_name = 'buyer_contact';
```
Expected: one row, `buyer_contact | ARRAY`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/015_buyer_contact.sql
git commit -m "feat: add reveal_requests.buyer_contact column"
```

---

### Task 3: POST /api/reveals — accept & validate buyer_contact

**Files:**
- Modify: `src/app/api/reveals/route.ts` (POST handler ~119-152; SELECT already includes buyer contact columns)

**Interfaces:**
- Consumes: `resolveSharedContact` (Task 1).
- Produces: `POST /api/reveals` now accepts body `{ listing_id, offer?, buyer_contact?: string[] }`; persists a server-validated `buyer_contact` array on the row.

- [ ] **Step 1: Add buyer_contact parse + validation in POST**

In `src/app/api/reveals/route.ts`, import the helper at top:
```typescript
import { effectiveRevealStatus, resolveSharedContact } from '@/lib/validation';
```
(keep any existing `effectiveRevealStatus` import — merge into one line.)

In the POST handler, change the body destructure:
```typescript
  const { listing_id, offer, buyer_contact } = await req.json().catch(() => ({}));
```

After the block check and BEFORE the insert, add buyer-contact validation (fetch the buyer's stored values, keep only methods they actually have):
```typescript
  // Validate the buyer's chosen methods against their stored profile values —
  // never trust the client. Empty/absent list falls back to all stored methods.
  const { data: buyerProfile } = await admin
    .from('profiles')
    .select('contact_instagram, contact_phone, contact_email')
    .eq('id', user.id)
    .single();
  const buyerValues = {
    instagram: buyerProfile?.contact_instagram ?? null,
    phone: buyerProfile?.contact_phone ?? null,
    email: buyerProfile?.contact_email ?? null,
  };
  const requested: string[] = Array.isArray(buyer_contact) && buyer_contact.length > 0
    ? buyer_contact
    : ['instagram', 'phone', 'email'];
  const buyerContact = Object.keys(resolveSharedContact(requested, buyerValues));
```

Change the insert to persist it:
```typescript
    .insert({ listing_id, buyer_id: user.id, seller_id: listing.seller_id, offer: offerAmount, buyer_contact: buyerContact })
```

- [ ] **Step 2: Manually exercise the endpoint**

With the dev server running (`npm run dev`), sign in as a buyer with saved contacts and POST a reveal (through the UI in Task 6, or via curl with a valid session cookie). Then query the row:
```sql
select buyer_contact from reveal_requests order by created_at desc limit 1;
```
Expected: the array reflects the buyer's chosen (or all stored) methods, never a method with no stored value.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/reveals/route.ts
git commit -m "feat: POST /api/reveals validates and stores buyer_contact"
```

---

### Task 4: toDto — mutual contact in the reveal DTO

Refactor the inline buyer-only contact block to use the helper, and add the seller-side mirror. Add `buyer_contact` to the row type and SELECT.

**Files:**
- Modify: `src/app/api/reveals/route.ts` (RevealRow type, SELECT, `toDto` ~42-88)

**Interfaces:**
- Consumes: `resolveSharedContact` (Task 1).
- Produces: `dto.contact` is populated for BOTH viewer roles when approved/completed — buyer sees seller's `listings.contact` ∩ seller values; seller sees `buyer_contact` ∩ buyer values.

- [ ] **Step 1: Add buyer_contact to SELECT and row type**

In `SELECT`, add `buyer_contact` to the top-level column list (after `offer`):
```
const SELECT = `id, listing_id, listing_title, buyer_id, seller_id, status, created_at, expires_at, offer, buyer_contact, resolved_at, seller_seen_at, buyer_seen_at, seller_dismissed_at, buyer_dismissed_at,
```
Add to the `RevealRow` type definition: `buyer_contact: string[] | null;`.

- [ ] **Step 2: Replace the inline contact block with the symmetric helper**

Replace the existing `if (isBuyer && ...)` contact block in `toDto` with:
```typescript
  // Both parties see the other's chosen contact once approved/completed.
  if (status === 'approved' || status === 'completed') {
    if (isBuyer && row.seller) {
      dto.contact = resolveSharedContact(row.listing?.contact ?? [], {
        instagram: row.seller.contact_instagram,
        phone: row.seller.contact_phone,
        email: row.seller.contact_email,
      });
    } else if (!isBuyer && row.buyer) {
      dto.contact = resolveSharedContact(row.buyer_contact ?? [], {
        instagram: row.buyer.contact_instagram,
        phone: row.buyer.contact_phone,
        email: row.buyer.contact_email,
      });
    }
  }
```

- [ ] **Step 3: Verify in the running app**

Not unit-testable (DB-backed route). Verified end-to-end in Task 8. For now, confirm the build compiles:
Run: `npx tsc --noEmit`
Expected: exit 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/reveals/route.ts
git commit -m "feat: toDto shares contact mutually (buyer + seller) via resolveSharedContact"
```

---

### Task 5: Approval emails — buyer email generalized + seller email added

**Files:**
- Modify: `src/app/api/reveals/[id]/route.ts` (approve branch ~50-72)
- Modify: `src/lib/notify.ts` (add a mutual-aware body; reuse `approvalEmail`)

**Interfaces:**
- Consumes: `resolveSharedContact` (Task 1), existing `approvalEmail`, `sendEmail`, `wantsEmail`, `verifiedEmailFor`.
- Produces: on approve, buyer receives seller's offered contact (all offered methods, not just legacy `contact_method`); seller receives buyer's `buyer_contact`.

- [ ] **Step 1: Add a multi-method email builder to notify.ts**

In `src/lib/notify.ts`, add below `approvalEmail`:
```typescript
// Mutual-aware: lists every shared method, not just one. `contact` is the
// output of resolveSharedContact (method -> value).
export function sharedContactEmail(actorName: string, listingTitle: string, contact: Partial<Record<string, string>>) {
  const labels: Record<string, string> = { instagram: 'Instagram', phone: 'Text', email: 'Email' };
  const lines = Object.entries(contact)
    .map(([m, v]) => `<p style="font-size:17px"><strong>${esc(labels[m] || m)}:</strong> ${esc(v as string)}</p>`)
    .join('');
  return {
    subject: `${actorName} — you're connected on "${listingTitle}"`,
    html: wrap(`<p>You're connected on <strong>${esc(listingTitle)}</strong>. Here's how to reach <strong>${esc(actorName)}</strong>:</p>${lines}<p>Reach out — they're expecting you.</p>`),
  };
}
```
(`esc` and `wrap` are already defined and used in this file.)

- [ ] **Step 2: Replace the approve-branch email logic**

In `src/app/api/reveals/[id]/route.ts`, add the import:
```typescript
import { resolveSharedContact } from '@/lib/validation';
import { sharedContactEmail, sendEmail, verifiedEmailFor, wantsEmail } from '@/lib/notify';
```
(Merge with the existing notify import line; drop `approvalEmail` if no longer referenced elsewhere in the file.)

Replace the `if (action === 'approve') { ... }` email block (the buyer-only one) with a mutual version that also fetches the listing's offered methods and the buyer's contact choice:
```typescript
  if (action === 'approve') {
    const [{ data: buyerProfile }, { data: sellerProfile }, { data: listingRow }] = await Promise.all([
      admin.from('profiles').select('display_name, notify_prefs, contact_instagram, contact_phone, contact_email').eq('id', existing.buyer_id).single(),
      admin.from('profiles').select('display_name, notify_prefs, contact_instagram, contact_phone, contact_email').eq('id', existing.seller_id).single(),
      admin.from('listings').select('title, contact').eq('id', existing.listing_id).single(),
    ]);
    const listingTitle = listingRow?.title ?? 'a listing';

    // Buyer gets the seller's offered contact (all offered methods).
    const sellerShared = resolveSharedContact(listingRow?.contact ?? [], {
      instagram: sellerProfile?.contact_instagram ?? null,
      phone: sellerProfile?.contact_phone ?? null,
      email: sellerProfile?.contact_email ?? null,
    });
    if (Object.keys(sellerShared).length && wantsEmail(buyerProfile?.notify_prefs, 'approval')) {
      const to = await verifiedEmailFor(existing.buyer_id);
      if (to) {
        const { subject, html } = sharedContactEmail(sellerProfile?.display_name ?? 'The seller', listingTitle, sellerShared);
        void sendEmail(to, subject, html);
      }
    }

    // Seller gets the buyer's chosen contact (mutual — the new half).
    const buyerShared = resolveSharedContact((existing as unknown as { buyer_contact: string[] | null }).buyer_contact ?? [], {
      instagram: buyerProfile?.contact_instagram ?? null,
      phone: buyerProfile?.contact_phone ?? null,
      email: buyerProfile?.contact_email ?? null,
    });
    if (Object.keys(buyerShared).length && wantsEmail(sellerProfile?.notify_prefs, 'approval')) {
      const to = await verifiedEmailFor(existing.seller_id);
      if (to) {
        const { subject, html } = sharedContactEmail(buyerProfile?.display_name ?? 'The buyer', listingTitle, buyerShared);
        void sendEmail(to, subject, html);
      }
    }
  }
```

**Required:** the `existing` row must include `buyer_contact`. Its query (near the top of PATCH) currently selects specific columns and does NOT include it. Update that SELECT to add `buyer_contact`:
```typescript
    .select('id, listing_id, buyer_id, seller_id, status, expires_at, buyer_contact, listing:listings(title)')
```

- [ ] **Step 3: Verify compile**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/reveals/[id]/route.ts src/lib/notify.ts
git commit -m "feat: mutual approval emails — both parties get the other's contact"
```

---

### Task 6: Multi-contact onboarding & profile edit

**Files:**
- Modify: `src/app/onboarding/page.tsx`
- Modify: `src/app/(app)/profile/edit/page.tsx`

**Interfaces:**
- Consumes: `primaryMethod` (Task 1); `/api/me` PATCH (already accepts `contact_instagram/phone/email/contact_method`).
- Produces: users can save any subset (≥1) of the three methods; `contact_method` auto-set to `primaryMethod`.

- [ ] **Step 1: Convert onboarding to multi-method state**

In `src/app/onboarding/page.tsx`:
- Replace `const [method, setMethod] = ...` and `const [value, setValue] = ...` with:
```typescript
  const [contacts, setContacts] = React.useState<{ instagram: string; phone: string; email: string }>({ instagram: '', phone: '', email: '' });
```
- Seed email from verified: in the `/api/me` effect, replace `if (profile?.contact_email) setVerifiedEmail(...)` follow-up so it also sets `setContacts((c) => ({ ...c, email: profile.contact_email }))`.
- Update the "returning user done" guard (line ~34): replace `profile?.contact_method` check with:
```typescript
        const hasContact = Boolean(profile?.contact_instagram || profile?.contact_phone || profile?.contact_email);
        if (profile?.display_name && hasContact) { router.replace('/feed'); return; }
```
- Replace the method-picker + single value input JSX with three labeled inputs (Instagram / Text / Email), each bound to `contacts[key]`. Use the existing `METHODS` array to render; keep `className="field"` inputs and `field-label` labels, matching existing style. All three visible at once.
- Replace the `finish` validation and PATCH body:
```typescript
    const filled = (['instagram', 'phone', 'email'] as const).filter((k) => contacts[k].trim());
    if (filled.length === 0) { setError('Add at least one way to reach you.'); return; }
    // ... inside PATCH body:
    body: JSON.stringify({
      display_name: name,
      class_year: year,
      school_unit: unit,
      contact_method: primaryMethod({ instagram: contacts.instagram.trim() || null, phone: contacts.phone.trim() || null, email: contacts.email.trim() || null }),
      contact_instagram: contacts.instagram.trim() || null,
      contact_phone: contacts.phone.trim() || null,
      contact_email: contacts.email.trim() || null,
    }),
```
- Import: `import { primaryMethod } from '@/lib/validation';`

- [ ] **Step 2: Apply the same multi-method pattern to profile edit**

In `src/app/(app)/profile/edit/page.tsx`: mirror the same change — a `contacts` object seeded from `me.contact_instagram/phone/email`, three inputs, ≥1 validation, PATCH body with all three plus `contact_method: primaryMethod(...)`. Reuse its existing `METHODS`/`MethodId` array for labels.

- [ ] **Step 3: Verify in the running app**

With `npm run dev`: open `/onboarding` (as a user who hasn't finished). Confirm three contact fields render; saving with all blank shows "Add at least one way to reach you."; saving with one or more persists. Confirm `/profile/edit` shows saved values in all filled fields.
Also: `npx tsc --noEmit` → exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/app/onboarding/page.tsx "src/app/(app)/profile/edit/page.tsx"
git commit -m "feat: multi-contact onboarding + profile edit"
```

---

### Task 7: Buyer contact picker in RevealModal + store wiring

**Files:**
- Modify: `src/components/WebApp.tsx` (RevealModal ~1480; needs access to `store.me` contact values)
- Modify: `src/app/(app)/listing/[id]/page.tsx` (onContinue wiring ~53)
- Modify: `src/lib/store.ts` (requestReveal ~323)

**Interfaces:**
- Consumes: `store.me` (has `contact_instagram/phone/email`); POST body from Task 3.
- Produces: `requestReveal(listingId, offer?, buyerContact?: string[])`; RevealModal `onContinue(offer?: number, buyerContact?: string[])`.

- [ ] **Step 1: Extend store.requestReveal signature**

In `src/lib/store.ts`, change:
```typescript
  const requestReveal = async (listingId: string, offer?: number, buyerContact?: string[]) => {
    const res = await fetch('/api/reveals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listing_id: listingId, offer, buyer_contact: buyerContact }),
    }).catch(() => null);
```
(rest of the function unchanged.)

- [ ] **Step 2: Add the picker to RevealModal**

In `src/components/WebApp.tsx`, update the RevealModal signature and body:
```typescript
export function RevealModal({ listing, me, onClose, onContinue }: { listing: Listing; me: Profile | null; onClose: () => void; onContinue: (offer?: number, buyerContact?: string[]) => void }) {
  const saved = (['instagram', 'phone', 'email'] as const).filter((k) => me?.[`contact_${k}` as const]);
  const [checked, setChecked] = React.useState<Record<string, boolean>>(() => Object.fromEntries(saved.map((k) => [k, true])));
  // ...
  const chosen = saved.filter((k) => checked[k]);
```
- In `handleShare`, pass `onContinue(offerAmount, chosen)`.
- Render, above the offer field, a checkbox row for each `saved` method (labels Instagram / Text / Email). If `saved.length === 0`, render inline "Add a contact method to request" + a link to `/profile/edit`, and disable the Share button. Require `chosen.length >= 1` to enable Share.
- Update the body copy paragraph to reflect mutual sharing, e.g.: "We'll share your name, school, year, and the contact methods you pick below. If {firstName} approves, you'll each see the other's contact." (Terse, no emoji.)
- Ensure `Profile` is imported in WebApp.tsx (it already imports from `@/lib/types` — add `Profile` to that import if absent).

- [ ] **Step 3: Pass `me` and forward buyerContact at the call site**

In `src/app/(app)/listing/[id]/page.tsx`:
```typescript
        <RevealModal
          listing={listing}
          me={store.me}
          onClose={() => setModal(null)}
          onContinue={async (offer, buyerContact) => {
            const r = await store.requestReveal(listing.id, offer, buyerContact);
            // ...existing result handling unchanged...
          }}
        />
```

- [ ] **Step 4: Verify in the running app**

`npm run dev`: as a buyer with 2 saved methods, open a listing → Reveal Contact. Confirm exactly those 2 checkboxes appear, both checked; unchecking both disables Share; sending works. As a buyer with 0 saved methods (edge), confirm the "add a contact method" prompt + disabled Share.
`npx tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/WebApp.tsx "src/app/(app)/listing/[id]/page.tsx" src/lib/store.ts
git commit -m "feat: buyer contact picker in reveal modal + store wiring"
```

---

### Task 8: Seller-side contact display + end-to-end verification

**Files:**
- Modify: `src/app/(app)/requests/page.tsx` and/or `src/components/WebApp.tsx` (seller's approved/completed row — render `reveal.contact` for the seller, reusing the buyer-side CONTACT render)

**Interfaces:**
- Consumes: `dto.contact` now populated for sellers (Task 4); `mapReveal`/`ActivityItem` already carries `contact` through to the client.

- [ ] **Step 1: Confirm the client carries contact for sellers**

In `src/lib/store.ts` `mapReveal` (~120), verify the DTO `contact` field is copied onto `ActivityItem` regardless of role (it was previously buyer-only in practice but the mapping is role-agnostic). If it drops contact for incoming (seller) items, remove that restriction so `contact` passes through for both.

- [ ] **Step 2: Render the buyer's contact on the seller's approved row**

In the seller's Requests inbox (`src/app/(app)/requests/page.tsx`) and/or the activity row in `WebApp.tsx`, for an APPROVED/COMPLETED incoming request, render a CONTACT block showing `item.contact` as clickable links — reuse the exact render used on the buyer's listing-detail CONTACT block (Instagram → `https://instagram.com/...`, phone → `tel:`, email → `mailto:`). Extract that render into a small shared component/function if it isn't already, to stay DRY.

- [ ] **Step 3: End-to-end verification (the core deliverable)**

Use the `verify` skill / Playwright against `npm run dev`. Drive the real two-user flow (two sessions or seeded demo users):
1. Buyer A (has Instagram + email saved) opens Seller B's listing (B offers phone + email), taps Reveal Contact, picks Instagram only, sends.
2. Seller B opens Requests → sees the pending request (no contact yet) → Approves.
3. **Assert buyer A** now sees B's contact = phone + email (B's offered ∩ stored), and ONLY those.
4. **Assert seller B** now sees A's contact = Instagram only (A's chosen ∩ stored), and ONLY that — this is the new mutual half.
5. Assert pre-approval neither side saw any contact; assert a declined request never exposes contact.
Capture screenshots of both sides post-approval.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/requests/page.tsx" src/components/WebApp.tsx src/lib/store.ts
git commit -m "feat: seller sees buyer's shared contact on approval (mutual reveal complete)"
```

---

## Self-Review

**Spec coverage:**
- Section 1 (data model, `buyer_contact text[]`, resolution rule) → Tasks 1, 2, 4. ✓
- Section 2 (multi-contact onboarding/profile, ≥1 validation, contact_method auto-set, "done" guard) → Task 6. ✓
- Section 3 (buyer picker in modal, only-saved methods, all-checked default, no-contact edge, server validation) → Tasks 3, 7. ✓
- Section 4 (mutual toDto, second approval email, seller contact UI, copy) → Tasks 4, 5, 7 (copy), 8. ✓
- Out-of-scope items (cancel, audit log, re-share, primary prompt) → not planned. ✓

**Placeholder scan:** No TBD/TODO; every code step shows real code. Task 8 Steps 1–2 describe reusing an existing render — acceptable because the exact CONTACT-block markup exists in `WebApp.tsx` (buyer branch) and the instruction is to extract/reuse it, not invent it.

**Type consistency:** `resolveSharedContact` / `primaryMethod` signatures identical across Tasks 1, 3, 4, 5, 6. `requestReveal(listingId, offer?, buyerContact?)` consistent in Tasks 3 (body), 7. `buyer_contact` (snake_case, API/DB) vs `buyerContact` (camelCase, client) used consistently per layer. `ContactMethod` type reused.

**Note on ordering:** Task 2 (migration) must land before Tasks 3–5 run against a real DB, but code for 3–5 can be written first; keep the committed order as written.
