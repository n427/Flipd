# RLS Policy Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Write correct RLS policies (keyed on `auth.uid()`) + a `public_profiles` view so a direct-to-Supabase mobile client is safe, without changing web-app behavior.

**Architecture:** One additive migration (`019_rls_policies.sql`) creates policies on the 8 already-RLS-enabled tables and a safe-columns view. A SQL test script impersonates two authenticated users (via `set request.jwt.claims`) and asserts each policy. A codebase audit confirms the web app (service-role/session clients, server-side) is unaffected. Production apply is gated on explicit user approval.

**Tech Stack:** Supabase (Postgres RLS), SQL, Supabase MCP (`apply_migration`, `execute_sql`) for a branch/local DB, grep for the audit.

## Global Constraints

- Service-role key bypasses RLS — the web app must remain unaffected. Verify before production apply.
- Contact fields (`contact_instagram/phone/email`, `contact_method`, `notify_prefs`, `is_demo`) MUST NOT be exposed to other users. Others' profiles are read only through `public_profiles`.
- `public_profiles` safe columns EXACTLY: `id, display_name, handle, school_unit, class_year, avatar_url, bio`.
- `reveal_requests`: anon/authenticated key gets SELECT only (buyer or seller of the row). NO insert/update policy — those stay server-side.
- Deny by default: RLS already enabled on all 8 tables; only add the policies below.
- Migrations are sequential in `supabase/migrations/`; next is `019`.
- **Production apply is GATED**: build + test on a branch/local DB, present results, apply to prod only on explicit approval.

---

### Task 1: The migration — policies + view

**Files:**
- Create: `supabase/migrations/019_rls_policies.sql`

- [ ] **Step 1: Write the migration**

```sql
-- RLS policy layer for direct-to-Supabase mobile access. RLS is already
-- enabled on all tables; this adds the policies and a safe public view.
-- Service-role bypasses all of this, so the web app is unaffected.

-- ── profiles ──
-- Own-row full access (a user reads/updates its own profile incl. its own
-- contact_* fields). No broad SELECT policy on the base table, so the
-- anon/authenticated key can NEVER read another user's contact_* directly.
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Cross-user public reads go through a SECURITY DEFINER view (security_invoker
-- = false, owned by postgres) that exposes ONLY safe columns. Because it runs
-- as its owner it bypasses the base-table RLS, so authenticated users can read
-- others' public fields WITHOUT a broad profiles SELECT policy — and contact_*
-- is physically absent from the view, so it can't leak.
create view public.public_profiles
  with (security_invoker = false) as
  select id, display_name, handle, school_unit, class_year, avatar_url, bio
  from public.profiles;
alter view public.public_profiles owner to postgres;
grant select on public.public_profiles to authenticated;

-- ── listings ──
create policy "listings_select_own_archived" on public.listings
  for select to authenticated using (seller_id = auth.uid());
create policy "listings_insert_own" on public.listings
  for insert to authenticated with check (seller_id = auth.uid());
create policy "listings_update_own" on public.listings
  for update to authenticated using (seller_id = auth.uid()) with check (seller_id = auth.uid());
create policy "listings_delete_own" on public.listings
  for delete to authenticated using (seller_id = auth.uid());
-- (listings_read_active already exists for archived = false.)

-- ── saves ──
create policy "saves_select_own" on public.saves
  for select to authenticated using (user_id = auth.uid());
create policy "saves_insert_own" on public.saves
  for insert to authenticated with check (user_id = auth.uid());
create policy "saves_delete_own" on public.saves
  for delete to authenticated using (user_id = auth.uid());

-- ── reveal_requests: READ ONLY for buyer/seller; writes stay server-side ──
create policy "reveals_select_party" on public.reveal_requests
  for select to authenticated using (buyer_id = auth.uid() or seller_id = auth.uid());

-- ── ratings: public read; insert own ──
create policy "ratings_select_all" on public.ratings
  for select to authenticated using (true);
create policy "ratings_insert_own" on public.ratings
  for insert to authenticated with check (rater_id = auth.uid());

-- ── reports: own only ──
create policy "reports_select_own" on public.reports
  for select to authenticated using (reporter_id = auth.uid());
create policy "reports_insert_own" on public.reports
  for insert to authenticated with check (reporter_id = auth.uid());

-- ── blocks: own only ──
create policy "blocks_select_own" on public.blocks
  for select to authenticated using (blocker_id = auth.uid());
create policy "blocks_insert_own" on public.blocks
  for insert to authenticated with check (blocker_id = auth.uid());
create policy "blocks_delete_own" on public.blocks
  for delete to authenticated using (blocker_id = auth.uid());

-- (popup_reminders self select/insert/delete policies already exist.)
```

- [ ] **Step 2: Apply to a Supabase BRANCH (not production)**

Use Supabase MCP `create_branch` to make a dev branch, then `apply_migration` (name `019_rls_policies`) against the branch. If branching isn't available, apply to a local `supabase db reset` stack. DO NOT apply to production yet.
Expected: success.

- [ ] **Step 3: Sanity check objects exist**

`execute_sql` on the branch:
```sql
select tablename, policyname from pg_policies where schemaname='public' order by tablename, policyname;
select table_name from information_schema.views where table_schema='public' and table_name='public_profiles';
```
Expected: all policies above present; the view exists.

- [ ] **Step 4: Commit the migration file**

```bash
git add supabase/migrations/019_rls_policies.sql
git commit -m "feat: RLS policy layer for direct-to-Supabase mobile access"
```

---

### Task 2: Policy test suite (as impersonated users)

**Files:**
- Create: `supabase/tests/019_rls_policies.test.sql`

**Interfaces:**
- Consumes: the policies from Task 1, on the branch DB.

- [ ] **Step 1: Write the test script**

The script sets the JWT claims to impersonate `authenticated` users A and B (two real profile UUIDs seeded on the branch), then asserts. Pattern per assertion:
```sql
-- Impersonate user A
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'user_a', 'role','authenticated')::text, true);
```
Assertions to include (each `do $$ ... raise exception if wrong ... $$;` or a select that must return the expected count):
1. A can SELECT its own profile row (contact_* visible to self).
2. A CANNOT select B's row from `public.profiles` directly (0 rows) — contact never leaks.
3. A CAN select B's public fields from `public_profiles` (1 row, and that row has no contact columns — the view lacks them).
4. A can SELECT an active listing (any); can SELECT its own archived listing; CANNOT select B's archived listing.
5. A can INSERT a listing with `seller_id = A`; CANNOT insert with `seller_id = B` (policy violation / 0 rows).
6. A can INSERT/SELECT/DELETE its own `saves`; cannot see B's saves.
7. A can SELECT a reveal where A is buyer or seller; CANNOT select a reveal between B and C.
8. A CANNOT INSERT or UPDATE `reveal_requests` (no policy → denied).
9. A can SELECT any rating; can INSERT a rating with `rater_id = A`; cannot insert as B.
10. A can INSERT/SELECT its own report; cannot see B's reports.
11. A can INSERT/SELECT/DELETE its own block; cannot see B's blocks.

- [ ] **Step 2: Run the test script on the branch**

`execute_sql` with the script contents (or `psql -f` against the local stack). Expected: all assertions pass; the script raises no exception and the negative cases return 0 rows / are rejected.

- [ ] **Step 3: Iterate until green**

If any assertion fails, fix the policy in `019_rls_policies.sql`, re-apply to the branch (`reset_branch` or re-run), re-run tests.

- [ ] **Step 4: Commit the tests**

```bash
git add supabase/tests/019_rls_policies.test.sql
git commit -m "test: RLS policy assertions for all tables + public_profiles"
```

---

### Task 3: Web-app safety audit

**Files:**
- Create: `docs/superpowers/rls-web-audit.md` (findings)

**Interfaces:**
- Consumes: nothing; inspects the web codebase.

- [ ] **Step 1: Audit client-side Supabase usage**

Confirm the web app never uses the anon key from the browser in a way these policies change. Run and record:
```bash
grep -rn "createBrowserClient\|createClient(" src/ | grep -v "admin.ts\|server.ts\|middleware.ts"
grep -rn "NEXT_PUBLIC_SUPABASE_ANON_KEY" src/
grep -rln "from '@/lib/supabase/admin'" src/ | wc -l   # server routes use service-role
```
Expected finding: all data access is server-side via `admin` (service-role, bypasses RLS) or the cookie `session` client (server components/routes). No browser-side table reads/writes with the anon key. Document the grep output and the conclusion.

- [ ] **Step 2: Note any exceptions**

If any client-side anon-key table access exists, list it and assess whether a policy above would break it. (Expected: none — but record the check honestly.)

- [ ] **Step 3: Commit the audit**

```bash
git add docs/superpowers/rls-web-audit.md
git commit -m "docs: web-app RLS safety audit (service-role only, unaffected)"
```

---

### Task 4: Production apply (GATED — explicit approval required)

**Files:** none (applies the committed migration to prod).

- [ ] **Step 1: Present the gate**

Show the user: the migration file, the passing test results (Task 2), and the audit conclusion (Task 3). State plainly this applies security policies to the live database affecting real users' data access. Ask for explicit approval to apply to production. DO NOT proceed without it.

- [ ] **Step 2: Apply to production (only after approval)**

Supabase MCP `apply_migration` (name `019_rls_policies`) against the production project. Then re-run the Task 3 sanity `pg_policies` query against prod to confirm.

- [ ] **Step 3: Post-apply smoke check**

Confirm the live web app still works: load `flipdcampus.com`, sign in, load the feed (the web app uses service-role so it must be unaffected). If anything regressed, the migration is additive policies — worst case, drop the new policies to revert.

- [ ] **Step 4: Clean up the branch**

If a Supabase branch was created for testing, delete it (`delete_branch`).

---

## Self-Review

**Spec coverage:**
- Per-table policies (all 8) → Task 1. ✓
- `public_profiles` safe view, contact never leaks → Task 1 + tests 2/3 in Task 2. ✓
- Reveal writes server-side (read-only policy, no insert/update) → Task 1 + test 8. ✓
- Service-role bypass / web app unaffected → Task 3 audit + Task 4 smoke check. ✓
- Deny-by-default preserved (RLS already on; only add policies) → Task 1. ✓
- Production apply gated → Task 4. ✓

**Placeholder scan:** No TBDs. Task 1's SQL is final (security-definer view owned by postgres, own-row policy, no broad base select). All test assertions are enumerated concretely.

**Type/name consistency:** Policy names unique per table+op; `public_profiles` column list identical in Task 1, constraint, and test 3. `auth.uid()` used consistently.

**Ambiguity resolved:** The profiles/view approach is the one genuinely tricky bit — final decision is a SECURITY DEFINER view (so cross-user public reads work without a broad base-table select policy that would expose contact_*). Task 1's note makes this explicit for the implementer.
