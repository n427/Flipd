-- Storage RLS for the listing-photos bucket: authenticated users may upload/
-- modify/delete only within their own {uid}/ folder. Reads stay public
-- (bucket is public: true). Service-role (web app) bypasses all of this.

create policy "listing_photos_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "listing_photos_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "listing_photos_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
