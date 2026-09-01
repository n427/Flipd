-- Give a new marketplace a useful first screen. These examples belong only to
-- existing demo profiles, use deterministic IDs, and are safe to refresh.

do $$
begin
  if (
    select count(*)
    from public.profiles
    where is_demo is true
      and id in (
        'a1100000-0000-4000-8000-000000000001',
        'a1100000-0000-4000-8000-000000000002',
        'a1100000-0000-4000-8000-000000000003'
      )
  ) <> 3 then
    raise exception 'Wanted examples require the three Flipd screenshot demo profiles';
  end if;
end $$;

insert into public.wanted_posts (
  id,
  buyer_id,
  title,
  category,
  max_budget,
  description,
  location,
  photo_urls,
  needed_by,
  status,
  created_at,
  updated_at,
  resolved_at
)
select
  seed.id::uuid,
  seed.buyer_id::uuid,
  seed.title,
  seed.category,
  seed.max_budget,
  seed.description,
  seed.location,
  array[seed.photo_url],
  clock_timestamp() + seed.deadline,
  'active',
  clock_timestamp() - seed.age,
  clock_timestamp() - seed.age,
  null
from (values
  (
    'c2200000-0000-4000-8000-000000000001',
    'a1100000-0000-4000-8000-000000000001',
    'Mini fridge for an apartment',
    'goods',
    90,
    'Looking for a clean mini fridge with a freezer shelf. I can pick up around campus and would love to find one before move-in weekend.',
    'USC Village',
    'https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?w=1200&auto=format&fit=crop',
    interval '9 days',
    interval '38 minutes'
  ),
  (
    'c2200000-0000-4000-8000-000000000002',
    'a1100000-0000-4000-8000-000000000002',
    'Used graduation gown',
    'goods',
    65,
    'Need a USC bachelor gown in good condition for fall commencement photos. Open to buying or borrowing for the weekend.',
    'University Park Campus',
    'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=1200&auto=format&fit=crop',
    interval '16 days',
    interval '3 hours'
  ),
  (
    'c2200000-0000-4000-8000-000000000003',
    'a1100000-0000-4000-8000-000000000003',
    'Calculus II tutor this week',
    'services',
    40,
    'Looking for two hours of help with sequences and series before my quiz. Prefer someone who has taken the USC course recently.',
    'Leavey Library',
    'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=1200&auto=format&fit=crop',
    interval '5 days',
    interval '1 hour'
  ),
  (
    'c2200000-0000-4000-8000-000000000004',
    'a1100000-0000-4000-8000-000000000001',
    'Help moving a couch',
    'services',
    75,
    'Need two people with a truck or van to move a small couch about six blocks. The whole job should take under an hour.',
    'North University Park',
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&auto=format&fit=crop',
    interval '7 days',
    interval '6 hours'
  ),
  (
    'c2200000-0000-4000-8000-000000000005',
    'a1100000-0000-4000-8000-000000000002',
    'Room near campus for spring',
    'housing',
    1350,
    'Searching for a furnished private room from January through May. Quiet apartment, walkable to campus, and utilities included would be ideal.',
    'West of USC',
    'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&auto=format&fit=crop',
    interval '24 days',
    interval '1 day'
  ),
  (
    'c2200000-0000-4000-8000-000000000006',
    'a1100000-0000-4000-8000-000000000003',
    'Summer sublet for two',
    'housing',
    2100,
    'Two friends looking for a furnished studio or one-bedroom from mid-May through early August. Flexible on the exact dates.',
    'Expo Park or USC Village',
    'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1200&auto=format&fit=crop',
    interval '30 days',
    interval '2 days'
  )
) as seed(id, buyer_id, title, category, max_budget, description, location, photo_url, deadline, age)
on conflict (id) do update set
  buyer_id = excluded.buyer_id,
  title = excluded.title,
  category = excluded.category,
  max_budget = excluded.max_budget,
  description = excluded.description,
  location = excluded.location,
  photo_urls = excluded.photo_urls,
  needed_by = excluded.needed_by,
  status = 'active',
  created_at = excluded.created_at,
  updated_at = excluded.updated_at,
  resolved_at = null;
