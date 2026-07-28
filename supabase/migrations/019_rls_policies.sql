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
-- listings_read_active (archived = false) already exists. Add own-row access.
create policy "listings_select_own_archived" on public.listings
  for select to authenticated using (seller_id = auth.uid());
create policy "listings_insert_own" on public.listings
  for insert to authenticated with check (seller_id = auth.uid());
create policy "listings_update_own" on public.listings
  for update to authenticated using (seller_id = auth.uid()) with check (seller_id = auth.uid());
create policy "listings_delete_own" on public.listings
  for delete to authenticated using (seller_id = auth.uid());

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
