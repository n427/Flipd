-- Isolated predicate test for migration 021. Builds a minimal storage schema
-- skeleton (real Supabase provides these) so the own-folder policy can be
-- exercised as an authenticated user. Verified 2026-07-28: PASS.
create schema if not exists storage;
create or replace function storage.foldername(name text)
  returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text,
  name text,
  owner uuid
);
alter table storage.objects enable row level security;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true),'')::uuid $$;
grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
grant usage on schema storage to authenticated; grant execute on function storage.foldername(text) to authenticated;
grant insert, select on storage.objects to authenticated;

create policy "listing_photos_insert_own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);

set role authenticated;
select set_config('app.uid', 'aaaaaaaa-0000-4000-8000-000000000001', false);

do $$ begin
  insert into storage.objects (bucket_id, name) values ('listing-photos', 'aaaaaaaa-0000-4000-8000-000000000001/pic.jpg');
  raise notice 'PASS: upload to own folder allowed';
exception when others then raise notice 'FAIL: own-folder upload blocked (%)', sqlerrm; end $$;

do $$ begin
  insert into storage.objects (bucket_id, name) values ('listing-photos', 'bbbbbbbb-0000-4000-8000-000000000002/pic.jpg');
  raise notice 'FAIL: upload to another user folder allowed (should be blocked)';
exception when others then raise notice 'PASS: other-folder upload blocked (%)', sqlerrm; end $$;
