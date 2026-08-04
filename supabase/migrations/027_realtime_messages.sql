-- Publish messages to Supabase Realtime so an open thread updates live on both
-- clients. Without this the subscription connects but never fires, and both
-- apps quietly fall back to refetch-on-focus.
--
-- Only public.messages is published. Row visibility still goes through the
-- messages_select_party policy in 025, so a subscriber receives changes only
-- for threads they belong to.
--
-- Attachments are NOT published: their rows carry storage paths, and a client
-- cannot use one without a server-signed URL anyway. A message insert is the
-- signal to refetch, which picks up freshly signed attachment URLs.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end
$$;

-- Realtime needs the full old row on update/delete to evaluate RLS against it.
-- Inserts are all we subscribe to today, but this keeps the behaviour correct
-- if edit or unsend is added later.
alter table public.messages replica identity full;
