# Mutual Contact Exchange — Design

**Date:** 2026-07-18
**Status:** Approved (design), pending implementation plan

## Summary

Flipd's reveal flow lets a **buyer initiate** a contact request and a **seller approve** it. Today it is **one-directional**: on approval, only the *seller's* contact is shared, and only to the *buyer*. This project makes it a **mutual exchange** — on approval, **both** parties see the contact the other chose to share.

Alongside this, we move from a **single contact method per user** to a **multi-method** model with **per-transaction picking**:

- **Onboarding / profile:** a user can save *any of* Instagram, phone (text), and email — as many as they want (min one).
- **Selling:** the seller already picks which of their methods to offer per listing (`listings.contact text[]`) — unchanged.
- **Buying:** the buyer now picks which of their methods to share per request (new `reveal_requests.buyer_contact text[]`).
- **On approval:** each side sees exactly the methods the other chose for that transaction, intersected with what they actually have stored.

## Current state (what already works — do not rebuild)

- Buyer initiates: `POST /api/reveals` + "Reveal Contact" button + optional offer.
- Seller approves/declines/completes: `PATCH /api/reveals/[id]`, seller-only guard, Requests inbox.
- Seller's contact shared **to buyer** on approval: in-app CONTACT block + immediate email.
- Full lifecycle: pending → approved → completed, plus declined/expired (72h lazy sweep), ratings, mark-sold, mutual blocks, unread/dismiss, notification emails.
- Storage: `profiles.contact_instagram / contact_phone / contact_email` already exist as separate columns; `/api/me` PATCH already accepts all three. Only the UI is single-method today.

## Decisions

1. **Buyer's shared contact = per-transaction pick** (not fixed preferred method, not USC-email-only). Symmetric with how sellers pick per listing.
2. **Buyer picks in the request modal** (the existing RevealModal, alongside the optional offer) — not a profile default, not auto-share-all.
3. **Buyer picker default = all saved methods checked**; buyer may uncheck; at least one must remain.
4. **Seller sees buyer's contact only *after* approval** — symmetric with the buyer side; no pre-approval contact hint.
5. **Onboarding "done" = display_name AND ≥1 contact_* value present** (not the legacy `contact_method` field).
6. Snapshot the buyer's choice on the reveal row (`buyer_contact text[]`), not resolved values — mirrors `listings.contact`, and profile edits don't retroactively change old requests.

**Migrations:** one new migration (add `reveal_requests.buyer_contact`). No `profiles` migration — the three `contact_*` columns already exist.

## Section 1 — Data & sharing model

**Profile storage:** no migration for storage. `contact_instagram/phone/email` already exist. `contact_method` is retained as an optional "primary" hint (auto-set to the first filled method), no longer the sole method.

**New column:** add `buyer_contact text[]` to `public.reveal_requests` (new migration). Holds the method names (`'instagram' | 'phone' | 'email'`) the buyer chose for this request. Nullable / defaults to empty for legacy rows.

**Resolution rule (both sides), computed at read time in `toDto`:**
- Seller's info shown to buyer = `listings.contact` ∩ seller's stored `contact_*` values *(exists today)*.
- Buyer's info shown to seller = `reveal_requests.buyer_contact` ∩ buyer's stored `contact_*` values *(new — mirror image)*.

## Section 2 — Multi-contact input (onboarding + profile edit)

**Files:** `src/app/onboarding/page.tsx`, `src/app/(app)/profile/edit/page.tsx`.

- Replace single-select (`method` + one `value`) with a `{ instagram, phone, email }` values object.
- Render all three methods as labeled optional inputs, all visible at once (no wizard, no stacked steps — per brand UX restraint).
- **Validation:** at least one method required. Single-line error surface ("Add at least one way to reach you.").
- Email input stays pre-seeded from the verified `@usc.edu`.
- **`contact_method`** auto-set to the first present method (order: instagram > phone > email). A default, not a user choice.
- Save PATCH sends whichever `contact_*` are non-empty (API already accepts all three).
- **Onboarding "done" guard:** redirect returning users to `/feed` when `display_name` AND at least one `contact_*` value are set.

## Section 3 — Buyer contact picker (request modal)

**Files:** `src/components/WebApp.tsx` (RevealModal), `src/app/(app)/listing/[id]/page.tsx`, `src/lib/store.ts`, `src/app/api/reveals/route.ts` (POST).

- RevealModal gains a method picker showing **only methods the buyer has saved** (checkboxes). Default: **all checked**. At least one must remain checked.
- **No-contact edge case** (rare post-migration): if the buyer has zero saved methods, show inline "Add a contact method to request" + link to profile edit; disable send.
- Wiring: `store.requestReveal(listingId, offer)` → `store.requestReveal(listingId, offer, buyerContact: string[])`.
- `POST /api/reveals` body gains `buyer_contact: string[]`. **Server validates** each entry is a real method the buyer has a stored value for (never trust the client); persists into `buyer_contact`.

## Section 4 — The reveal (both sides) + copy

**API — `toDto` (`src/app/api/reveals/route.ts`):** add the mirror of the existing buyer branch — when the viewer is the **seller** and status ∈ {approved, completed}, attach the buyer's contact (`buyer_contact` ∩ buyer's stored values). Both sides now get a populated `counterpart.contact`.

**Approval email (`src/app/api/reveals/[id]/route.ts`):** on approve, in addition to the existing buyer email (seller's contact), send a **second email to the seller** with the buyer's shared contact, reusing the `approvalEmail` builder.

**In-app UI:**
- Buyer (listing detail CONTACT block): unchanged.
- Seller (Requests inbox / activity): approved/completed rows gain a CONTACT block rendering the buyer's shared methods as the same clickable links (Instagram / `tel:` / `mailto:`), reusing the buyer-side render component.

**Copy/timeline (terse, SVG icons only, no emoji):** timeline stays `Requested → Approved → Contact shared → Completed`. Seller's approved-row label reflects the mutual outcome (e.g. "You connected") and shows buyer contact.

## Out of scope (YAGNI)

- Buyer cancel/withdraw of a pending request.
- Per-method audit log beyond the `buyer_contact` snapshot.
- Re-share / re-request after a decline.
- "Which is primary" prompt for the user (auto-derived).

## Testing / verification

- **Migration:** `buyer_contact` column added, legacy rows default safely.
- **Multi-contact onboarding:** save 1, 2, and 3 methods; min-one validation; returning-user guard on ≥1 contact.
- **Buyer picker:** only saved methods appear; all-checked default; can't send with zero checked; server rejects a method the buyer has no value for.
- **Mutual reveal (the core):** after approval, drive both surfaces in a real browser — buyer sees seller's chosen contact, **seller sees buyer's chosen contact** — and confirm each side sees *only* the methods the other picked. Confirm both approval emails fire.
- **Symmetry / privacy:** pre-approval, neither side sees the other's contact; declined/expired never expose contact.
