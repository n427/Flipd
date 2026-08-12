-- Auto-handle assertions (migration 030). Run against a THROWAWAY database with
-- public.profiles (001) and the 030 functions/trigger applied.
-- NOT yet run: no local Postgres or Docker on the machine this was written on.

do $$ begin
  if public.slugify_handle('Nicole Zhang') = 'nicole.zhang'
  then raise notice 'PASS: spaces become a dot';
  else raise notice 'FAIL: got %', public.slugify_handle('Nicole Zhang'); end if;
end $$;

do $$ begin
  if public.slugify_handle('  Anh-Thu   Nguyen!! ') = 'anh.thu.nguyen'
  then raise notice 'PASS: punctuation runs collapse, edges trimmed';
  else raise notice 'FAIL: got %', public.slugify_handle('  Anh-Thu   Nguyen!! '); end if;
end $$;

do $$ begin
  if public.slugify_handle('🎉🎉') is null
  then raise notice 'PASS: unusable name slugs to null';
  else raise notice 'FAIL: got %', public.slugify_handle('🎉🎉'); end if;
end $$;

-- A name arriving on an existing row is the real onboarding path: the signup
-- trigger inserts a nameless stub first, then PATCH /api/me fills the name.
do $$
declare h text;
begin
  insert into public.profiles (id, display_name)
  values ('a0000000-0000-4000-8000-000000000001', 'Nicole Zhang');
  select handle into h from public.profiles
  where id = 'a0000000-0000-4000-8000-000000000001';
  if h = 'nicole.zhang'
  then raise notice 'PASS: handle assigned on insert';
  else raise notice 'FAIL: got %', h; end if;
end $$;

do $$
declare h text;
begin
  insert into public.profiles (id) values ('a0000000-0000-4000-8000-000000000002');
  update public.profiles set display_name = 'Nicole Zhang'
  where id = 'a0000000-0000-4000-8000-000000000002';
  select handle into h from public.profiles
  where id = 'a0000000-0000-4000-8000-000000000002';
  if h = 'nicole.zhang2'
  then raise notice 'PASS: collision gets a numeric suffix';
  else raise notice 'FAIL: got %', h; end if;
end $$;

do $$
declare h text;
begin
  insert into public.profiles (id, display_name, handle)
  values ('a0000000-0000-4000-8000-000000000003', 'Marcus Lee', 'marcus');
  select handle into h from public.profiles
  where id = 'a0000000-0000-4000-8000-000000000003';
  if h = 'marcus'
  then raise notice 'PASS: an explicit handle is not overwritten';
  else raise notice 'FAIL: got %', h; end if;
end $$;

-- A shared URL must not rot because someone edited their display name.
do $$
declare h text;
begin
  update public.profiles set display_name = 'Nicole Z'
  where id = 'a0000000-0000-4000-8000-000000000001';
  select handle into h from public.profiles
  where id = 'a0000000-0000-4000-8000-000000000001';
  if h = 'nicole.zhang'
  then raise notice 'PASS: renaming keeps the original handle';
  else raise notice 'FAIL: got %', h; end if;
end $$;
