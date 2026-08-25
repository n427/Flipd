-- Authenticated clients can read through RLS but all Wanted row mutation and
-- attached-media deletion must remain server-only.
do $$ begin
  if has_table_privilege('authenticated','public.wanted_posts','INSERT')
     or has_table_privilege('authenticated','public.wanted_posts','UPDATE')
     or has_table_privilege('authenticated','public.wanted_posts','DELETE')
     or has_table_privilege('authenticated','public.wanted_offers','INSERT')
     or has_table_privilege('authenticated','public.wanted_offers','UPDATE')
     or has_table_privilege('authenticated','public.wanted_offers','DELETE') then
    raise exception 'FAIL: authenticated still has direct Wanted mutation privileges';
  end if;
  raise notice 'PASS: Wanted row mutations are server-only';
end $$;

do $$ begin
  if exists(select 1 from pg_policies where schemaname='storage' and tablename='objects'
    and policyname in ('wanted_reference_photos_update_own','wanted_reference_photos_delete_own',
      'wanted_offer_photos_update_owner_offer','wanted_offer_photos_delete_owner_offer')) then
    raise exception 'FAIL: direct Wanted Storage update/delete policy remains';
  end if;
  raise notice 'PASS: attached Wanted media cannot be directly updated or deleted';
end $$;

do $$ begin
  if not exists(select 1 from pg_trigger where tgname='wanted_posts_server_mutations_only' and not tgisinternal)
     or not exists(select 1 from pg_trigger where tgname='wanted_offers_server_mutations_only' and not tgisinternal) then
    raise exception 'FAIL: defense-in-depth mutation triggers missing';
  end if;
  raise notice 'PASS: authenticated mutation triggers installed';
end $$;
