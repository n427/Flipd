-- Forward-only migration: 040 may already be applied in an environment, so
-- the atomic Wanted deletion RPC must be introduced separately rather than by
-- rewriting that historical migration.
--
-- Soft deletion shares the same parent-row lock as acceptance. This makes the
-- post state change and declining of pending competitors one transaction while
-- intentionally retaining accepted offers and their message-thread history.
create or replace function public.delete_wanted_post(target_post_id uuid, actor_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  locked_post public.wanted_posts%rowtype;
begin
  select *
    into locked_post
    from public.wanted_posts
   where id = target_post_id
   for update;

  if not found then
    raise exception 'wanted post not found' using errcode = 'P0002';
  end if;

  if actor_id is null or actor_id <> locked_post.buyer_id then
    raise exception 'only the wanted post buyer can delete a post' using errcode = '42501';
  end if;

  -- Retries are successful and do not alter the original resolution timestamp.
  if locked_post.status = 'deleted' then
    return 'already_deleted';
  end if;

  update public.wanted_posts
     set status = 'deleted',
         resolved_at = clock_timestamp()
   where id = locked_post.id;

  update public.wanted_offers
     set status = 'declined',
         resolved_at = clock_timestamp()
   where wanted_post_id = locked_post.id
     and status = 'pending';

  return 'deleted';
end;
$$;

revoke all on function public.delete_wanted_post(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_wanted_post(uuid, uuid) to service_role;
