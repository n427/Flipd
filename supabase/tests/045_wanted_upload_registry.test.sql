-- Regression assertions for the irreversible upload registry state machine.
insert into public.profiles(id,display_name,handle) values
('a4500000-0000-4000-8000-000000000001','Upload owner','upload.owner') on conflict(id) do nothing;

select public.register_wanted_upload(
  'a4500000-0000-4000-8000-000000000001/a4500000-0000-4000-8000-000000000002/claimed.jpg',
  'wanted-offer-photos','a4500000-0000-4000-8000-000000000001',null
);
select public.register_wanted_upload(
  'a4500000-0000-4000-8000-000000000001/a4500000-0000-4000-8000-000000000002/attached.jpg',
  'wanted-offer-photos','a4500000-0000-4000-8000-000000000001',null
);

select public.claim_wanted_upload_cleanup(
  array['a4500000-0000-4000-8000-000000000001/a4500000-0000-4000-8000-000000000002/claimed.jpg'],
  'wanted-offer-photos','a4500000-0000-4000-8000-000000000001'
);

do $$ begin
  perform public.sync_wanted_offer_uploads(
    'a4500000-0000-4000-8000-000000000002','a4500000-0000-4000-8000-000000000001',
    array['a4500000-0000-4000-8000-000000000001/a4500000-0000-4000-8000-000000000002/claimed.jpg']
  );
  raise exception 'FAIL: cleanup-claimed upload was attached' using errcode='XX001';
exception when sqlstate 'XX001' then raise; when raise_exception then raise notice 'PASS: claimed upload cannot be attached'; end $$;

select public.sync_wanted_offer_uploads(
  'a4500000-0000-4000-8000-000000000002','a4500000-0000-4000-8000-000000000001',
  array['a4500000-0000-4000-8000-000000000001/a4500000-0000-4000-8000-000000000002/attached.jpg']
);

do $$ begin
  perform public.claim_wanted_upload_cleanup(
    array['a4500000-0000-4000-8000-000000000001/a4500000-0000-4000-8000-000000000002/attached.jpg'],
    'wanted-offer-photos','a4500000-0000-4000-8000-000000000001'
  );
  raise exception 'FAIL: attached upload was cleanup-claimed' using errcode='XX001';
exception when sqlstate 'XX001' then raise; when raise_exception then raise notice 'PASS: attached upload cannot be cleanup-claimed'; end $$;

-- A retry remains cleanup_claimed; it never returns to uploaded after an
-- external Storage success or failure.
select public.claim_wanted_upload_cleanup(
  array['a4500000-0000-4000-8000-000000000001/a4500000-0000-4000-8000-000000000002/claimed.jpg'],
  'wanted-offer-photos','a4500000-0000-4000-8000-000000000001'
);
do $$ begin
  if not exists(select 1 from public.wanted_uploads where path like '%/claimed.jpg' and state='cleanup_claimed')
  then raise exception 'FAIL: cleanup tombstone was not durable'; end if;
  raise notice 'PASS: cleanup tombstone is durable and retryable';
end $$;

delete from public.wanted_uploads where owner_id='a4500000-0000-4000-8000-000000000001';
