-- Regression assertions for migration 042. These exercise the transactional
-- API functions directly; block insertion obtains FK KEY SHARE locks on the
-- same profile rows that the functions lock FOR UPDATE.

insert into public.profiles (id, display_name, handle)
values
  ('a4200000-0000-4000-8000-000000000001', 'Wanted safety buyer', 'wanted.safety.buyer'),
  ('b4200000-0000-4000-8000-000000000002', 'Wanted safety seller', 'wanted.safety.seller'),
  ('c4200000-0000-4000-8000-000000000003', 'Wanted safety stranger', 'wanted.safety.stranger')
on conflict (id) do nothing;

delete from public.wanted_posts
where id in (
  'd4200000-0000-4000-8000-000000000004'::uuid,
  'e4200000-0000-4000-8000-000000000005'::uuid,
  'f4200000-0000-4000-8000-000000000006'::uuid
);

insert into public.wanted_posts (id, buyer_id, title, category, max_budget, description, location, needed_by, status)
values
  ('d4200000-0000-4000-8000-000000000004', 'a4200000-0000-4000-8000-000000000001',
   'Transactional mutation guard', 'goods', 20, 'Checks every state transition.', 'USC', now() + interval '1 day', 'active'),
  ('e4200000-0000-4000-8000-000000000005', 'a4200000-0000-4000-8000-000000000001',
   'Nonactive mutation guard', 'goods', 20, 'A fulfilled post rejects mutation.', 'USC', now() + interval '1 day', 'fulfilled'),
  ('f4200000-0000-4000-8000-000000000006', 'a4200000-0000-4000-8000-000000000001',
   'Expired mutation guard', 'goods', 20, 'An elapsed deadline rejects mutation.', 'USC', now() + interval '2 seconds', 'active');

select public.submit_wanted_offer(
  'd4200000-0000-4000-8000-000000000004',
  'b4200000-0000-4000-8000-000000000002',
  'a4200000-0000-4000-8000-000000000007',
  10, 'Good condition', 'Available Friday.',
  array['b4200000-0000-4000-8000-000000000002/a4200000-0000-4000-8000-000000000007/front.jpg']
);

select public.submit_wanted_offer(
  'f4200000-0000-4000-8000-000000000006',
  'b4200000-0000-4000-8000-000000000002',
  'c4200000-0000-4000-8000-000000000009',
  10, 'Expires before mutation', 'No late mutation allowed.',
  array['b4200000-0000-4000-8000-000000000002/c4200000-0000-4000-8000-000000000009/front.jpg']
);

-- A block already committed before a transactional operation is rejected.
insert into public.blocks (blocker_id, blocked_id)
values ('a4200000-0000-4000-8000-000000000001', 'b4200000-0000-4000-8000-000000000002')
on conflict do nothing;

do $$
begin
  perform public.accept_wanted_offer(
    'a4200000-0000-4000-8000-000000000007', 'a4200000-0000-4000-8000-000000000001'
  );
  raise exception 'FAIL: blocked acceptance succeeded' using errcode = 'XX001';
exception when insufficient_privilege then raise notice 'PASS: blocked acceptance rejected';
end;
$$;

delete from public.blocks
where blocker_id = 'a4200000-0000-4000-8000-000000000001'
  and blocked_id = 'b4200000-0000-4000-8000-000000000002';

do $$
begin
  perform public.mutate_wanted_offer(
    'a4200000-0000-4000-8000-000000000007', 'c4200000-0000-4000-8000-000000000003', 'decline'
  );
  raise exception 'FAIL: nonparticipant mutation succeeded' using errcode = 'XX001';
exception when insufficient_privilege then raise notice 'PASS: nonparticipant mutation rejected';
end;
$$;

-- The mutation function locks and rechecks the parent before its offer state.
insert into public.wanted_offers (
  id, wanted_post_id, seller_id, buyer_id, price, description, message, photo_paths, status
) values (
  'b4200000-0000-4000-8000-000000000008', 'e4200000-0000-4000-8000-000000000005',
  'b4200000-0000-4000-8000-000000000002', 'a4200000-0000-4000-8000-000000000001',
  10, 'Retained closed offer', 'No mutation allowed.',
  array['b4200000-0000-4000-8000-000000000002/b4200000-0000-4000-8000-000000000008/front.jpg'], 'withdrawn'
);

do $$
begin
  perform public.mutate_wanted_offer(
    'b4200000-0000-4000-8000-000000000008', 'b4200000-0000-4000-8000-000000000002', 'withdraw'
  );
  raise exception 'FAIL: mutation on fulfilled post succeeded' using errcode = 'XX001';
exception when raise_exception then raise notice 'PASS: nonactive post mutation rejected';
end;
$$;

select pg_sleep(2.1);
-- An offer that was pending before the deadline cannot be mutated after it.
do $$
begin
  perform public.mutate_wanted_offer(
    'c4200000-0000-4000-8000-000000000009', 'b4200000-0000-4000-8000-000000000002', 'withdraw'
  );
  raise exception 'FAIL: expired post mutation succeeded' using errcode = 'XX001';
exception when raise_exception then raise notice 'PASS: expired post mutation rejected';
end;
$$;

do $$
begin
  update public.wanted_offers set status = 'accepted' where id = 'a4200000-0000-4000-8000-000000000007';
  perform public.mutate_wanted_offer('a4200000-0000-4000-8000-000000000007', 'b4200000-0000-4000-8000-000000000002', 'withdraw');
  raise exception 'FAIL: accepted offer mutation succeeded' using errcode = 'XX001';
exception when raise_exception then raise notice 'PASS: accepted offer mutation rejected';
end;
$$;

do $$
begin
  update public.wanted_offers set status = 'declined' where id = 'a4200000-0000-4000-8000-000000000007';
  perform public.mutate_wanted_offer('a4200000-0000-4000-8000-000000000007', 'b4200000-0000-4000-8000-000000000002', 'withdraw');
  raise exception 'FAIL: declined offer mutation succeeded' using errcode = 'XX001';
exception when raise_exception then raise notice 'PASS: declined offer mutation rejected';
end;
$$;

do $$
begin
  update public.wanted_offers set status = 'withdrawn' where id = 'a4200000-0000-4000-8000-000000000007';
  perform public.mutate_wanted_offer('a4200000-0000-4000-8000-000000000007', 'b4200000-0000-4000-8000-000000000002', 'withdraw');
  raise exception 'FAIL: withdrawn offer mutation succeeded' using errcode = 'XX001';
exception when raise_exception then raise notice 'PASS: withdrawn offer mutation rejected';
end;
$$;

delete from public.wanted_posts
where id in (
  'd4200000-0000-4000-8000-000000000004'::uuid,
  'e4200000-0000-4000-8000-000000000005'::uuid,
  'f4200000-0000-4000-8000-000000000006'::uuid
);
