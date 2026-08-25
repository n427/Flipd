-- Flipd App Store screenshot fixtures: Wanted feed, offers received/sent, and conversation.
-- Replace the email, then run manually in Supabase SQL Editor. Safe to re-run.
begin;

create temporary table screenshot_wanted_config (viewer_email text primary key) on commit drop;
insert into screenshot_wanted_config values ('YOUR_USC_EMAIL@usc.edu');

do $$ begin
  if not exists (
    select 1 from auth.users u join screenshot_wanted_config c on lower(u.email) = lower(c.viewer_email)
  ) then
    raise exception 'Screenshot account not found. Replace YOUR_USC_EMAIL@usc.edu and sign in once first.';
  end if;
end $$;

insert into public.profiles (id, display_name, handle, school_unit, class_year, avatar_url, is_demo)
values
  ('b1100000-0000-4000-8000-000000000001', 'Maya Chen', 'maya.wanted', 'Marshall', 'Junior', 'https://i.pravatar.cc/300?img=47', true),
  ('b1100000-0000-4000-8000-000000000002', 'Jordan Lee', 'jordan.wanted', 'Viterbi', 'Senior', 'https://i.pravatar.cc/300?img=12', true),
  ('b1100000-0000-4000-8000-000000000003', 'Sofia Martinez', 'sofia.wanted', 'Annenberg', 'Sophomore', 'https://i.pravatar.cc/300?img=32', true)
on conflict (id) do update set display_name=excluded.display_name, handle=excluded.handle,
  school_unit=excluded.school_unit, class_year=excluded.class_year, avatar_url=excluded.avatar_url;

-- Exactly three active public requests, plus one fulfilled history anchor for
-- the accepted conversation. The viewer has two received and two sent offers.
insert into public.wanted_posts (id,buyer_id,title,category,max_budget,description,location,photo_urls,needed_by,status,created_at,resolved_at)
select v.id::uuid,
  case when v.mine then u.id else v.buyer_id::uuid end,
  v.title,v.category,v.budget,v.description,v.location,array[v.photo],now()+v.deadline,v.status,now()-v.age,
  case when v.status='fulfilled' then now()-interval '25 minutes' else null end
from auth.users u join screenshot_wanted_config c on lower(u.email)=lower(c.viewer_email)
cross join (values
 ('b2200000-0000-4000-8000-000000000001',true,null,'Looking for a compact desk','goods',120,'A small desk that fits beside a dorm bed. Light wood preferred.','USC Village','https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?w=1200',interval '8 days','active',interval '2 hours'), -- ACTIVE_PUBLIC_FIXTURE
 ('b2200000-0000-4000-8000-000000000002',false,'b1100000-0000-4000-8000-000000000001','Need graduation photos','services',150,'Looking for a one-hour golden-hour portrait session around campus.','Tommy Trojan','https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=1200',interval '12 days','active',interval '1 day'), -- ACTIVE_PUBLIC_FIXTURE
 ('b2200000-0000-4000-8000-000000000003',false,'b1100000-0000-4000-8000-000000000002','Seeking summer sublet','housing',1400,'Quiet furnished room within walking distance of campus for June and July.','North University Park','https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200',interval '20 days','active',interval '4 hours'), -- ACTIVE_PUBLIC_FIXTURE
 ('b2200000-0000-4000-8000-000000000004',false,'b1100000-0000-4000-8000-000000000003','Portrait session booked','services',150,'Accepted screenshot transaction retained outside the public feed.','Tommy Trojan','https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=1200',interval '12 days','fulfilled',interval '2 days')
) v(id,mine,buyer_id,title,category,budget,description,location,photo,deadline,status,age)
on conflict (id) do update set title=excluded.title,description=excluded.description,max_budget=excluded.max_budget,
  photo_urls=excluded.photo_urls,needed_by=excluded.needed_by,status=excluded.status,resolved_at=excluded.resolved_at;

insert into public.wanted_offers (id,wanted_post_id,buyer_id,seller_id,price,description,message,photo_paths,status,created_at,updated_at,resolved_at)
select v.id::uuid,v.post_id::uuid,p.buyer_id,
  case when v.viewer_sells then u.id else v.seller_id::uuid end,
  v.price,v.description,v.message,array[(case when v.viewer_sells then u.id else v.seller_id::uuid end)::text||'/'||v.id||'/screenshot.jpg'],
  v.status,now()-v.age,now()-v.age,case when v.status='accepted' then now()-interval '25 minutes' else null end
from auth.users u join screenshot_wanted_config c on lower(u.email)=lower(c.viewer_email)
cross join (values
 ('b3300000-0000-4000-8000-000000000001','b2200000-0000-4000-8000-000000000001',false,'b1100000-0000-4000-8000-000000000001',85,'Solid oak writing desk in great condition.','I can bring it to the Village tomorrow afternoon.','pending',interval '35 minutes'), -- RECEIVED_FIXTURE
 ('b3300000-0000-4000-8000-000000000002','b2200000-0000-4000-8000-000000000001',false,'b1100000-0000-4000-8000-000000000003',105,'Minimal white desk with two drawers.','Pickup is near Expo Park and I can help load it.','pending',interval '1 hour'), -- RECEIVED_FIXTURE
 ('b3300000-0000-4000-8000-000000000003','b2200000-0000-4000-8000-000000000004',true,null,125,'One-hour campus session with 25 edited photos.','Golden hour Tuesday works perfectly for me.','accepted',interval '3 hours'), -- SENT_FIXTURE ACCEPTED_CONVERSATION_FIXTURE
 ('b3300000-0000-4000-8000-000000000004','b2200000-0000-4000-8000-000000000002',true,null,135,'Campus portrait session with edited digital photos.','I have Wednesday and Thursday at golden hour open.','pending',interval '50 minutes') -- SENT_FIXTURE
) v(id,post_id,viewer_sells,seller_id,price,description,message,status,age)
join public.wanted_posts p on p.id=v.post_id::uuid
on conflict (id) do update set price=excluded.price,description=excluded.description,message=excluded.message,
  photo_paths=excluded.photo_paths,status=excluded.status,updated_at=excluded.updated_at,resolved_at=excluded.resolved_at;

insert into public.message_threads (id,request_id,wanted_offer_id,listing_id,listing_title,buyer_id,seller_id,created_at,last_message_at,buyer_seen_at,seller_seen_at)
select 'b4400000-0000-4000-8000-000000000001',null,o.id,null,p.title,o.buyer_id,o.seller_id,
  now()-interval '25 minutes',now()-interval '6 minutes',now()-interval '20 minutes',now()-interval '20 minutes'
from public.wanted_offers o join public.wanted_posts p on p.id=o.wanted_post_id
where o.id='b3300000-0000-4000-8000-000000000003'
on conflict (wanted_offer_id) do update set listing_title=excluded.listing_title,last_message_at=excluded.last_message_at;

delete from public.messages where thread_id='b4400000-0000-4000-8000-000000000001';
insert into public.messages (id,thread_id,sender_id,body,created_at)
select v.id::uuid,t.id,case when v.from_buyer then t.buyer_id else t.seller_id end,v.body,now()-v.age
from (values
 ('b5500000-0000-4000-8000-000000000001',true,'Tuesday at 6:00 by Tommy Trojan?',interval '18 minutes'),
 ('b5500000-0000-4000-8000-000000000002',false,'Perfect. I will bring a few location ideas!',interval '6 minutes')
) v(id,from_buyer,body,age)
join public.message_threads t on t.id='b4400000-0000-4000-8000-000000000001';

commit;

-- Cleanup (run separately only after screenshots are finished):
-- begin;
-- delete from public.wanted_offers where id::text like 'b3300000-%';
-- delete from public.wanted_posts where id::text like 'b2200000-%';
-- delete from public.profiles where id::text like 'b1100000-%';
-- commit;
