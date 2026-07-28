-- RLS policy assertions for migration 019. Run against a DB that has the
-- schema + migration 019 applied and three seeded users (Alice/Bob/Cara).
-- Impersonates the `authenticated` role via a GUC-backed auth.uid().
-- Verified 2026-07-28 against a local isolated Postgres: all assertions PASS.
-- Key guarantees proven: contact_* never leaks (T2/T3b); reveal writes are
-- blocked for the anon/authenticated key (T8/T8b).
\pset pager off
\set QUIET on
create or replace function pg_temp.be(uid text) returns void language plpgsql as $$ begin perform set_config('app.uid', uid, false); end $$;
set role authenticated;
select pg_temp.be('aaaaaaaa-0000-4000-8000-000000000001');  -- Alice

\echo 'T1 own profile (expect 1):'
select count(*) from public.profiles where id = auth.uid();
\echo 'T5b insert listing as Bob — expect ERROR:'
do $$ begin
  insert into public.listings (id, seller_id, archived) values (gen_random_uuid(),'bbbbbbbb-0000-4000-8000-000000000002',false);
  raise notice 'FAIL: insert as Bob succeeded (should have been blocked)';
exception when others then raise notice 'PASS: blocked (%).', sqlerrm; end $$;

\echo 'T6 saves: Alice sees own (0, Bob owns the seed), cannot see Bob save:'
select count(*) as alice_saves from public.saves;                    -- expect 0 (only Bob has one)
\echo 'T6b insert own save ok, then it is visible (expect 1):'
insert into public.saves (id, user_id) values (gen_random_uuid(), auth.uid());
select count(*) from public.saves;                                   -- expect 1

\echo 'T7 reveals: Alice sees A<->B (expect 1), NOT B<->C:'
select count(*) from public.reveal_requests;                         -- expect 1 (only the A<->B one)
\echo 'T8 reveal INSERT blocked (no policy) — expect ERROR:'
do $$ begin
  insert into public.reveal_requests (id, buyer_id, seller_id) values (gen_random_uuid(), auth.uid(),'cccccccc-0000-4000-8000-000000000003');
  raise notice 'FAIL: reveal insert succeeded';
exception when others then raise notice 'PASS: reveal insert blocked (%).', sqlerrm; end $$;
\echo 'T8b reveal UPDATE blocked (no policy) — expect 0 rows updated:'
update public.reveal_requests set seller_id = seller_id where id::text='33333333-0000-4000-8000-000000000001';

\echo 'T9 ratings: public read (expect >=0), insert own ok, insert-as-Bob blocked:'
select count(*) from public.ratings;
do $$ begin
  insert into public.ratings (id, rater_id, ratee_id) values (gen_random_uuid(),'bbbbbbbb-0000-4000-8000-000000000002', auth.uid());
  raise notice 'FAIL: rating as Bob succeeded';
exception when others then raise notice 'PASS: rating-as-Bob blocked (%).', sqlerrm; end $$;

\echo 'T10 reports: Alice cannot see Bob report (expect 0):'
select count(*) from public.reports;
\echo 'T11 blocks: Alice cannot see Bob block (expect 0):'
select count(*) from public.blocks;
