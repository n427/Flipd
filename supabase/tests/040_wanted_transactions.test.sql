-- Regression assertions for migration 040. Run after migrations against a
-- local Supabase database. Pending offers must never be created or reactivated
-- once their parent is fulfilled, expired, or deleted.

insert into public.profiles (id, display_name, handle)
values
  ('a4000000-0000-4000-8000-000000000001', 'Wanted transaction buyer', 'wanted.transaction.buyer'),
  ('b4000000-0000-4000-8000-000000000002', 'Wanted transaction seller', 'wanted.transaction.seller')
on conflict (id) do nothing;

delete from public.wanted_posts
where id in (
  'c4000000-0000-4000-8000-000000000003'::uuid,
  'd4000000-0000-4000-8000-000000000004'::uuid,
  'e4000000-0000-4000-8000-000000000005'::uuid,
  'f4000000-0000-4000-8000-000000000006'::uuid,
  'a4000000-0000-4000-8000-000000000007'::uuid
);

insert into public.wanted_posts (
  id, buyer_id, title, category, max_budget, description, location, needed_by, status
) values
  ('c4000000-0000-4000-8000-000000000003', 'a4000000-0000-4000-8000-000000000001',
   'Fulfilled guard', 'goods', 10, 'Pending creation must be rejected.', 'USC', now() + interval '1 day', 'fulfilled'),
  ('d4000000-0000-4000-8000-000000000004', 'a4000000-0000-4000-8000-000000000001',
   'Deleted guard', 'goods', 10, 'Pending creation must be rejected.', 'USC', now() + interval '1 day', 'deleted'),
  ('e4000000-0000-4000-8000-000000000005', 'a4000000-0000-4000-8000-000000000001',
   'Expired guard', 'goods', 10, 'Pending creation must be rejected.', 'USC', now() + interval '0.1 seconds', 'active'),
  ('f4000000-0000-4000-8000-000000000006', 'a4000000-0000-4000-8000-000000000001',
   'Cascade delete guard', 'goods', 10, 'A deleted parent must leave no pending offer.', 'USC', now() + interval '1 day', 'active'),
  ('a4000000-0000-4000-8000-000000000007', 'a4000000-0000-4000-8000-000000000001',
   'Completion guard', 'goods', 10, 'Acceptance must not mark this transaction complete.', 'USC', now() + interval '1 day', 'active');

select pg_sleep(0.2);

do $$
begin
  insert into public.wanted_offers (
    wanted_post_id, seller_id, buyer_id, price, description, message, photo_paths
  ) values (
    'c4000000-0000-4000-8000-000000000003', 'b4000000-0000-4000-8000-000000000002',
    'a4000000-0000-4000-8000-000000000001', 10, 'Fulfilled offer', 'No pending offer allowed.', array['offer.jpg']
  );
  raise exception 'FAIL: pending offer was created for a fulfilled post';
exception
  when check_violation then raise notice 'PASS: fulfilled post rejects pending offer creation';
end;
$$;

insert into public.wanted_offers (
  id, wanted_post_id, seller_id, buyer_id, price, description, message, photo_paths
) values (
  'b4000000-0000-4000-8000-000000000008', 'a4000000-0000-4000-8000-000000000007',
  'b4000000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000001',
  10, 'Accepted offer', 'Acceptance must leave completion pending.', array['offer.jpg']
);

do $$
declare
  accepted_thread_id uuid;
begin
  select public.accept_wanted_offer(
    'b4000000-0000-4000-8000-000000000008',
    'a4000000-0000-4000-8000-000000000001'
  ) into accepted_thread_id;

  if accepted_thread_id is null
     or not exists (
       select 1 from public.wanted_offers
       where id = 'b4000000-0000-4000-8000-000000000008'
         and status = 'accepted'
         and completed_at is null
     ) then
    raise exception 'FAIL: accepting an offer completed it prematurely';
  end if;
  raise notice 'PASS: accepted offer remains incomplete until transaction completion';
end;
$$;

do $$
begin
  insert into public.wanted_offers (
    wanted_post_id, seller_id, buyer_id, price, description, message, photo_paths
  ) values (
    'd4000000-0000-4000-8000-000000000004', 'b4000000-0000-4000-8000-000000000002',
    'a4000000-0000-4000-8000-000000000001', 10, 'Deleted offer', 'No pending offer allowed.', array['offer.jpg']
  );
  raise exception 'FAIL: pending offer was created for a deleted post';
exception
  when check_violation then raise notice 'PASS: deleted post rejects pending offer creation';
end;
$$;

do $$
begin
  insert into public.wanted_offers (
    wanted_post_id, seller_id, buyer_id, price, description, message, photo_paths
  ) values (
    'e4000000-0000-4000-8000-000000000005', 'b4000000-0000-4000-8000-000000000002',
    'a4000000-0000-4000-8000-000000000001', 10, 'Expired offer', 'No pending offer allowed.', array['offer.jpg']
  );
  raise exception 'FAIL: pending offer was created after the deadline';
exception
  when check_violation then raise notice 'PASS: expired post rejects pending offer creation';
end;
$$;

insert into public.wanted_offers (
  wanted_post_id, seller_id, buyer_id, price, description, message, photo_paths, status
) values (
  'c4000000-0000-4000-8000-000000000003', 'b4000000-0000-4000-8000-000000000002',
  'a4000000-0000-4000-8000-000000000001', 10, 'Withdrawn offer', 'Reactivation must be rejected.', array['offer.jpg'], 'withdrawn'
), (
  'd4000000-0000-4000-8000-000000000004', 'b4000000-0000-4000-8000-000000000002',
  'a4000000-0000-4000-8000-000000000001', 10, 'Deleted withdrawn offer', 'Reactivation must be rejected.', array['offer.jpg'], 'withdrawn'
), (
  'e4000000-0000-4000-8000-000000000005', 'b4000000-0000-4000-8000-000000000002',
  'a4000000-0000-4000-8000-000000000001', 10, 'Expired withdrawn offer', 'Reactivation must be rejected.', array['offer.jpg'], 'withdrawn'
);

do $$
begin
  update public.wanted_offers
     set status = 'pending'
   where wanted_post_id = 'c4000000-0000-4000-8000-000000000003';
  raise exception 'FAIL: fulfilled-post offer was reactivated to pending';
exception
  when check_violation then raise notice 'PASS: fulfilled post rejects pending reactivation';
end;
$$;

do $$
begin
  update public.wanted_offers
     set status = 'pending'
   where wanted_post_id = 'd4000000-0000-4000-8000-000000000004';
  raise exception 'FAIL: deleted-post offer was reactivated to pending';
exception
  when check_violation then raise notice 'PASS: deleted post rejects pending reactivation';
end;
$$;

do $$
begin
  update public.wanted_offers
     set status = 'pending'
   where wanted_post_id = 'e4000000-0000-4000-8000-000000000005';
  raise exception 'FAIL: expired-post offer was reactivated to pending';
exception
  when check_violation then raise notice 'PASS: expired post rejects pending reactivation';
end;
$$;

insert into public.wanted_offers (
  wanted_post_id, seller_id, buyer_id, price, description, message, photo_paths
) values (
  'f4000000-0000-4000-8000-000000000006', 'b4000000-0000-4000-8000-000000000002',
  'a4000000-0000-4000-8000-000000000001', 10, 'Cascade offer', 'Delete must cascade this offer.', array['offer.jpg']
);

delete from public.wanted_posts
where id = 'f4000000-0000-4000-8000-000000000006';

do $$
begin
  if exists (
    select 1 from public.wanted_offers
    where wanted_post_id = 'f4000000-0000-4000-8000-000000000006'
      and status = 'pending'
  ) then
    raise exception 'FAIL: deleting a post left a pending offer behind';
  end if;
  raise notice 'PASS: deleting a post cascades its pending offers';
end;
$$;

delete from public.wanted_posts
where id in (
  'c4000000-0000-4000-8000-000000000003'::uuid,
  'd4000000-0000-4000-8000-000000000004'::uuid,
  'e4000000-0000-4000-8000-000000000005'::uuid,
  'a4000000-0000-4000-8000-000000000007'::uuid
);
