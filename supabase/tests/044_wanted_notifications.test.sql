-- Regression assertions for migration 044. Run after migrations against a
-- throwaway local Supabase database.

insert into public.profiles (id, display_name, handle) values
  ('a4400000-0000-4000-8000-000000000001', 'Notification buyer', 'notification.buyer'),
  ('b4400000-0000-4000-8000-000000000002', 'Notification seller one', 'notification.seller.one'),
  ('c4400000-0000-4000-8000-000000000003', 'Notification seller two', 'notification.seller.two')
on conflict (id) do nothing;

delete from public.wanted_posts where id in (
  'd4400000-0000-4000-8000-000000000004',
  'e4400000-0000-4000-8000-000000000005'
);

insert into public.wanted_posts (
  id, buyer_id, title, category, max_budget, description, location, needed_by
) values
  ('d4400000-0000-4000-8000-000000000004', 'a4400000-0000-4000-8000-000000000001',
   'Acceptance events', 'goods', 100, 'Two competing offers.', 'USC', now() + interval '2 days'),
  ('e4400000-0000-4000-8000-000000000005', 'a4400000-0000-4000-8000-000000000001',
   'Deletion events', 'goods', 100, 'One offer closes on delete.', 'USC', now() + interval '2 days');

insert into public.wanted_offers (
  id, wanted_post_id, seller_id, buyer_id, price, description, message, photo_paths
) values
  ('f4400000-0000-4000-8000-000000000006', 'd4400000-0000-4000-8000-000000000004',
   'b4400000-0000-4000-8000-000000000002', 'a4400000-0000-4000-8000-000000000001',
   80, 'Offer one', 'First.', array['offer-one.jpg']),
  ('a4400000-0000-4000-8000-000000000007', 'd4400000-0000-4000-8000-000000000004',
   'c4400000-0000-4000-8000-000000000003', 'a4400000-0000-4000-8000-000000000001',
   90, 'Offer two', 'Second.', array['offer-two.jpg']),
  ('b4400000-0000-4000-8000-000000000008', 'e4400000-0000-4000-8000-000000000005',
   'b4400000-0000-4000-8000-000000000002', 'a4400000-0000-4000-8000-000000000001',
   70, 'Delete offer', 'Close me.', array['delete-offer.jpg']);

select public.accept_wanted_offer(
  'f4400000-0000-4000-8000-000000000006',
  'a4400000-0000-4000-8000-000000000001'
);

do $$
begin
  if not exists (
    select 1 from public.notification_events
    where event_key = 'wanted:accepted:f4400000-0000-4000-8000-000000000006'
      and user_id = 'b4400000-0000-4000-8000-000000000002'
  ) or not exists (
    select 1 from public.notification_events
    where event_key = 'wanted:declined:a4400000-0000-4000-8000-000000000007'
      and user_id = 'c4400000-0000-4000-8000-000000000003'
  ) then
    raise exception 'FAIL: acceptance did not persist the exact seller events';
  end if;
  raise notice 'PASS: acceptance transaction persisted accepted and competitor events';
end;
$$;

-- Cosmetic title/reference edits do not notify; budget does.
update public.wanted_posts
   set title = 'Cosmetic title', photo_urls = array['reference.jpg']
 where id = 'e4400000-0000-4000-8000-000000000005';

do $$
begin
  if exists (
    select 1 from public.notification_events
    where event_type = 'edit' and wanted_post_id = 'e4400000-0000-4000-8000-000000000005'
  ) then raise exception 'FAIL: cosmetic edit emitted a notification'; end if;
end;
$$;

update public.wanted_posts set max_budget = 110
where id = 'e4400000-0000-4000-8000-000000000005';

select public.delete_wanted_post(
  'e4400000-0000-4000-8000-000000000005',
  'a4400000-0000-4000-8000-000000000001'
);

do $$
begin
  if not exists (
    select 1 from public.notification_events
    where event_type = 'edit'
      and wanted_post_id = 'e4400000-0000-4000-8000-000000000005'
      and user_id = 'b4400000-0000-4000-8000-000000000002'
  ) or not exists (
    select 1 from public.notification_events
    where event_key = 'wanted:declined:b4400000-0000-4000-8000-000000000008'
      and user_id = 'b4400000-0000-4000-8000-000000000002'
  ) then
    raise exception 'FAIL: material edit or delete closure event missing';
  end if;
  raise notice 'PASS: material edits and deletion closures persist seller events';
end;
$$;

delete from public.wanted_posts where id in (
  'd4400000-0000-4000-8000-000000000004',
  'e4400000-0000-4000-8000-000000000005'
);
