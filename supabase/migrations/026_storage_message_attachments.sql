-- Storage for message photos and video.
--
-- Unlike listing-photos (021), this bucket is PRIVATE. A listing photo is meant
-- to be seen by the whole feed; a message attachment is part of a private
-- conversation, and a public bucket would make every one of them readable by
-- anyone holding the URL. Reads therefore go through short-lived signed URLs
-- minted server-side, only after the caller is confirmed to be a participant in
-- the thread.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-attachments',
  'message-attachments',
  false,
  104857600, -- 100 MB, the video cap; images are held to 10 MB in the API
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'video/mp4', 'video/quicktime'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Uploads are scoped to the sender's own {uid}/ folder, same shape as 021.
-- There is deliberately NO select policy for authenticated users: nobody reads
-- this bucket directly. The server (service role) bypasses RLS and signs URLs
-- for participants, which is what keeps a non-participant from fetching an
-- attachment even if they learn its path.
create policy "message_attachments_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "message_attachments_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
