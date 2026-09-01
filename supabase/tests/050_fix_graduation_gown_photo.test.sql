begin;

do $$
declare
  gown_photo text;
begin
  select photo_urls[1]
  into gown_photo
  from public.wanted_posts
  where id = 'c2200000-0000-4000-8000-000000000002';

  if gown_photo <> 'https://images.unsplash.com/photo-1627556704302-624286467c65?w=1200&auto=format&fit=crop' then
    raise exception 'FAIL: graduation gown example still has the wrong photo (%)', gown_photo;
  end if;

  raise notice 'PASS: graduation gown example uses the graduation photo';
end $$;

rollback;
