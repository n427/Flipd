-- Regression assertions for migration 039. Run after the project's migrations
-- have been applied to a local Supabase database. These fixed profiles are
-- standalone rows, so no auth.users seed is required.

insert into public.profiles (id, display_name, handle)
values
  ('a3900000-0000-4000-8000-000000000001', 'Wanted owner', 'wanted.owner'),
  ('b3900000-0000-4000-8000-000000000002', 'Wanted viewer', 'wanted.viewer')
on conflict (id) do nothing;

delete from public.blocks
where (blocker_id, blocked_id) in (
  ('a3900000-0000-4000-8000-000000000001'::uuid, 'b3900000-0000-4000-8000-000000000002'::uuid),
  ('b3900000-0000-4000-8000-000000000002'::uuid, 'a3900000-0000-4000-8000-000000000001'::uuid)
);
delete from public.wanted_posts where id = 'c3900000-0000-4000-8000-000000000003';

do $$
begin
  insert into public.wanted_posts (
    buyer_id, title, category, max_budget, description, location, needed_by
  ) values (
    'a3900000-0000-4000-8000-000000000001', 'Past deadline', 'goods', 10,
    'Must be rejected by the deadline trigger.', 'USC', now()
  );
  raise exception 'FAIL: past needed_by was accepted';
exception
  when check_violation then raise notice 'PASS: past needed_by rejected';
end;
$$;

do $$
begin
  insert into public.wanted_posts (
    buyer_id, title, category, max_budget, description, location, photo_urls, needed_by
  ) values (
    'a3900000-0000-4000-8000-000000000001', 'Too many photos', 'goods', 10,
    'Must be rejected by the photo count check.', 'USC',
    array['1','2','3','4','5','6','7'], now() + interval '1 day'
  );
  raise exception 'FAIL: seven photo URLs were accepted';
exception
  when check_violation then raise notice 'PASS: seventh photo URL rejected';
end;
$$;

insert into public.wanted_posts (
  id, buyer_id, title, category, max_budget, description, location, needed_by
) values (
  'c3900000-0000-4000-8000-000000000003',
  'a3900000-0000-4000-8000-000000000001', 'Wanted test post', 'goods', 10,
  'An active post used to verify blocks and the update timestamp.', 'USC',
  now() + interval '1 day'
);

create temporary table wanted_post_before_update as
select id, updated_at from public.wanted_posts
where id = 'c3900000-0000-4000-8000-000000000003';

select pg_sleep(0.01);
update public.wanted_posts
set title = 'Wanted test post updated'
where id = 'c3900000-0000-4000-8000-000000000003';

do $$
begin
  if not exists (
    select 1
    from public.wanted_posts p
    join wanted_post_before_update before_update using (id)
    where p.id = 'c3900000-0000-4000-8000-000000000003'
      and p.updated_at > before_update.updated_at
  ) then
    raise exception 'FAIL: wanted_posts.updated_at did not advance';
  end if;
  raise notice 'PASS: wanted_posts.updated_at advances on update';
end;
$$;

create or replace function pg_temp.be(uid text)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
end;
$$;

set role authenticated;
select pg_temp.be('b3900000-0000-4000-8000-000000000002');

do $$
begin
  if (select count(*) from public.wanted_posts where id = 'c3900000-0000-4000-8000-000000000003') <> 1 then
    raise exception 'FAIL: active post was not readable before blocking';
  end if;
  raise notice 'PASS: unblocked active post is readable';
end;
$$;

reset role;
insert into public.blocks (blocker_id, blocked_id)
values ('a3900000-0000-4000-8000-000000000001', 'b3900000-0000-4000-8000-000000000002');

set role authenticated;
select pg_temp.be('b3900000-0000-4000-8000-000000000002');

do $$
begin
  if (select count(*) from public.wanted_posts where id = 'c3900000-0000-4000-8000-000000000003') <> 0 then
    raise exception 'FAIL: post author blocking viewer did not hide the post';
  end if;
  raise notice 'PASS: author block hides active post from viewer';
end;
$$;

reset role;
delete from public.blocks
where blocker_id = 'a3900000-0000-4000-8000-000000000001'
  and blocked_id = 'b3900000-0000-4000-8000-000000000002';
insert into public.blocks (blocker_id, blocked_id)
values ('b3900000-0000-4000-8000-000000000002', 'a3900000-0000-4000-8000-000000000001');

set role authenticated;
select pg_temp.be('b3900000-0000-4000-8000-000000000002');

do $$
begin
  if (select count(*) from public.wanted_posts where id = 'c3900000-0000-4000-8000-000000000003') <> 0 then
    raise exception 'FAIL: viewer blocking author did not hide the post';
  end if;
  raise notice 'PASS: viewer block hides active post from viewer';
end;
$$;

select pg_temp.be('a3900000-0000-4000-8000-000000000001');

do $$
begin
  if (select count(*) from public.wanted_posts where id = 'c3900000-0000-4000-8000-000000000003') <> 1 then
    raise exception 'FAIL: owner history was hidden by a block';
  end if;
  raise notice 'PASS: owner retains wanted-post history';
end;
$$;

reset role;
delete from public.blocks
where (blocker_id, blocked_id) in (
  ('a3900000-0000-4000-8000-000000000001'::uuid, 'b3900000-0000-4000-8000-000000000002'::uuid),
  ('b3900000-0000-4000-8000-000000000002'::uuid, 'a3900000-0000-4000-8000-000000000001'::uuid)
);
delete from public.wanted_posts where id = 'c3900000-0000-4000-8000-000000000003';
