-- All Wanted row mutation runs through service-role routes and transactional
-- wrappers. RLS remains useful for reads, but is not the media state machine.
revoke all privileges on table public.wanted_posts from public, anon, authenticated;
revoke all privileges on table public.wanted_offers from public, anon, authenticated;
revoke insert(id,buyer_id,title,category,max_budget,description,location,place_name,lat,lng,photo_urls,needed_by,status,resolved_at)
  on table public.wanted_posts from public,anon,authenticated;
revoke update(id,buyer_id,title,category,max_budget,description,location,place_name,lat,lng,photo_urls,needed_by,status,resolved_at)
  on table public.wanted_posts from public,anon,authenticated;
revoke insert(id,wanted_post_id,seller_id,buyer_id,price,description,message,photo_paths,status,resolved_at,completed_at)
  on table public.wanted_offers from public,anon,authenticated;
revoke update(id,wanted_post_id,seller_id,buyer_id,price,description,message,photo_paths,status,resolved_at,completed_at)
  on table public.wanted_offers from public,anon,authenticated;
grant select on table public.wanted_posts, public.wanted_offers to authenticated;
grant select,insert,update,delete on table public.wanted_posts, public.wanted_offers to service_role;

-- Defense in depth if a future grant accidentally restores table privileges.
-- SECURITY DEFINER wrappers execute as their owner; direct PostgREST mutation
-- executes as authenticated/anon and is rejected before touching a row.
create or replace function public.reject_direct_wanted_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  if current_user in ('anon','authenticated') then
    raise exception 'wanted mutations require the server transaction API' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists wanted_posts_server_mutations_only on public.wanted_posts;
create trigger wanted_posts_server_mutations_only before insert or update or delete on public.wanted_posts
for each row execute function public.reject_direct_wanted_mutation();
drop trigger if exists wanted_offers_server_mutations_only on public.wanted_offers;
create trigger wanted_offers_server_mutations_only before insert or update or delete on public.wanted_offers
for each row execute function public.reject_direct_wanted_mutation();

revoke all on function public.reject_direct_wanted_mutation() from public,anon,authenticated;

-- Clients may create owner-prefixed uploads, but only the service route may
-- remove them after claim_wanted_upload_cleanup commits a durable tombstone.
drop policy if exists "wanted_reference_photos_update_own" on storage.objects;
drop policy if exists "wanted_reference_photos_delete_own" on storage.objects;
drop policy if exists "wanted_offer_photos_update_owner_offer" on storage.objects;
drop policy if exists "wanted_offer_photos_delete_owner_offer" on storage.objects;
