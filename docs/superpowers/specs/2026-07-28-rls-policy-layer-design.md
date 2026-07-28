# RLS Policy Layer — Design

**Date:** 2026-07-28
**Status:** Approved (design), pending implementation plan
**Context:** Sub-project 1 of 3 toward a native (Expo) mobile app. The mobile app will talk **directly to Supabase** with the anon/authenticated key, so Row-Level Security becomes the real gatekeeper. Today RLS is a deny-all backstop (server API routes use the service-role key and enforce rules in code). This sub-project writes the full policy set so direct-to-Supabase is safe. Sub-projects 2 (Expo scaffold + auth) and 3 (screens) follow.

## Goal

Give the anon/authenticated Supabase key exactly the access a mobile client needs — no more, no less — via correct RLS policies keyed on `auth.uid()`, without changing web-app behavior (which uses the service-role key and bypasses RLS).

## Hard principles

1. **Service-role bypasses RLS → the web app is unaffected.** These policies only govern the anon/authenticated key. The web app's server routes keep working unchanged. This is the core safety property; it will be **verified before applying** (audit that no client-side code relies on the anon key doing something these policies newly allow/block).
2. **Contact fields never leak.** `profiles` holds `contact_instagram/phone/email`. RLS is row-level, not column-level, so *other* users' profiles are read through a **`public_profiles` view** exposing only safe columns (no `contact_*`). A user reads their **own** full profile row directly. This preserves the mutual-reveal invariant: contact is only shared through an approved reveal.
3. **The most sensitive write flow stays server-side.** Reveal writes (send request, approve/decline/complete, mark-sold side effects) carry a state machine + offer-gating that RLS/triggers can't cleanly encode. RLS allows the mobile app to **read** reveals directly; reveal **writes** go through the token-authed API routes (built in sub-project 2). Re-encoding that logic as DB triggers is more code and more risk for the exact flow where a bug would leak contact info.
4. **Deny by default.** RLS stays enabled; only the exact policies below open access. Anything unlisted is denied.

## Per-table policies (`me` = `auth.uid()`)

| Table | SELECT | INSERT (with check) | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | own row: `id = me` (others via `public_profiles` view) | — (signup trigger creates) | `id = me` | — |
| `listings` | `archived = false OR seller_id = me` | `seller_id = me` | `seller_id = me` | `seller_id = me` |
| `saves` | `user_id = me` | `user_id = me` | — | `user_id = me` |
| `reveal_requests` | `buyer_id = me OR seller_id = me` | **server-side only** (no anon INSERT policy) | **server-side only** | — |
| `ratings` | any authenticated (public) | `rater_id = me` | — | — |
| `reports` | `reporter_id = me` | `reporter_id = me` | — | — |
| `blocks` | `blocker_id = me` | `blocker_id = me` | — | `blocker_id = me` |
| `popup_reminders` | `user_id = me` | `user_id = me` | — | `user_id = me` |

Notes:
- **`reveal_requests`**: read-only for the anon/authenticated key (buyer or seller of the row). No INSERT/UPDATE policy → those operations are denied to the mobile client and must go through the service-role API routes. This enforces principle 3 automatically.
- **`ratings`**: publicly readable (a seller's ratings are shown to buyers). Rater anonymity is a UI concern (the row has `rater_id`; the client just doesn't surface it), consistent with the web app today.
- **`public_profiles` view**: `security_invoker` view selecting `id, display_name, handle, school_unit, class_year, avatar_url, bio` from `profiles`. Granted `select` to `authenticated`. Never selects `contact_*`, `notify_prefs`, or other private columns.

## `public_profiles` view + column safety

- Create `public.public_profiles` as a view over `profiles` with only the safe columns listed above.
- `grant select on public.public_profiles to authenticated;`
- The mobile app reads *other* users through this view; reads *itself* through `profiles` (own-row policy) when it needs private fields (its own contact methods, notify prefs).

## Deliverables

1. **Migration `019_rls_policies.sql`** — enables RLS on any table not already enabled (`ratings`, `reports`, `blocks`, `popup_reminders` were enabled in their own migrations; confirm and fill gaps), creates all policies in the table above, and creates the `public_profiles` view + grant.
2. **Automated policy tests** — a SQL/script test suite that, acting as two different authenticated users (not service-role), asserts each policy: a user can read/write their own rows, cannot read/write another user's private rows, cannot read anyone's `contact_*` via `public_profiles`, can read active listings and public ratings, and cannot INSERT/UPDATE `reveal_requests` directly. These run against a local/branch DB, not production.
3. **Web-app safety audit** — before applying to production: grep/inspect the web codebase to confirm no client-side (browser) code uses the anon key to read/write tables in a way these policies would change. Document the result.

## Out of scope (YAGNI)

- The Expo app itself (sub-project 2).
- Token-auth on the API routes (sub-project 2 — needed for reveal writes from mobile).
- Column-level security beyond the `public_profiles` view.
- Rewriting reveal logic as DB triggers (explicitly rejected — stays server-side).
- Realtime / subscriptions policies (add later if a screen needs them).

## Verification & rollout

- Build migration + tests; run tests against a **local or Supabase branch** DB; all green.
- Run the web-app safety audit; confirm no regressions.
- **Gate:** present the migration + test results + audit to the user. Apply to the **production** database only on explicit approval (security-sensitive, hard to reverse, affects live users' data access).
