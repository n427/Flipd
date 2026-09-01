begin;

do $$
declare
  seeded_count integer;
  active_count integer;
  goods_count integer;
  services_count integer;
  housing_count integer;
begin
  select
    count(*),
    count(*) filter (where status = 'active' and needed_by > now()),
    count(*) filter (where category = 'goods'),
    count(*) filter (where category = 'services'),
    count(*) filter (where category = 'housing')
  into seeded_count, active_count, goods_count, services_count, housing_count
  from public.wanted_posts
  where id in (
    'c2200000-0000-4000-8000-000000000001',
    'c2200000-0000-4000-8000-000000000002',
    'c2200000-0000-4000-8000-000000000003',
    'c2200000-0000-4000-8000-000000000004',
    'c2200000-0000-4000-8000-000000000005',
    'c2200000-0000-4000-8000-000000000006'
  );

  if seeded_count <> 6 then
    raise exception 'FAIL: expected 6 example Wanted posts, found %', seeded_count;
  end if;
  if active_count <> 6 then
    raise exception 'FAIL: every example Wanted post must be active with a future deadline';
  end if;
  if goods_count <> 2 or services_count <> 2 or housing_count <> 2 then
    raise exception 'FAIL: examples must include 2 goods, 2 services, and 2 housing posts';
  end if;

  raise notice 'PASS: six active Wanted examples span every category';
end $$;

rollback;
