-- Fix: touch_thread_last_message assigned new.created_at unconditionally, so a
-- message inserted out of order (a backfill, a dev seed, a retried write) would
-- drag last_message_at backwards and mis-sort the thread list.
--
-- 025 has been corrected for fresh installs; this migration carries the same fix
-- to databases where 025 already ran.
create or replace function public.touch_thread_last_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.message_threads
     set last_message_at = greatest(coalesce(last_message_at, new.created_at), new.created_at)
   where id = new.thread_id;
  return new;
end;
$$;

-- Repair any thread whose stored value already drifted.
update public.message_threads t
   set last_message_at = m.newest
  from (
    select thread_id, max(created_at) as newest
      from public.messages
     group by thread_id
  ) m
 where m.thread_id = t.id
   and (t.last_message_at is null or t.last_message_at < m.newest);
