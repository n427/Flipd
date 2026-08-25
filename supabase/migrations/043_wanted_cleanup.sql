-- Extend account deletion to Wanted data without deleting accepted transaction
-- history that the surviving participant still needs. Storage objects are
-- removed by the server before this function redacts their database paths.

-- Normal offers always have at least one photo (the submit/edit RPCs enforce
-- that invariant). Account deletion is the sole reason a retained offer may
-- have no paths: its private objects have been removed from Storage.
alter table public.wanted_offers
  drop constraint if exists wanted_offers_photo_paths_check;
alter table public.wanted_offers
  add constraint wanted_offers_photo_paths_check
  check (cardinality(photo_paths) between 0 and 6);

create or replace function public.cleanup_deleted_account(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Remove private settings and device/digest traces.
  delete from public.legal_acceptances where user_id = target_user_id;
  delete from public.push_tokens where user_id = target_user_id;
  delete from public.search_events where user_id = target_user_id;
  delete from public.saves where user_id = target_user_id;
  delete from public.popup_reminders where user_id = target_user_id;
  delete from public.blocks where blocker_id = target_user_id or blocked_id = target_user_id;

  -- Attachments are personal media. Message and transaction rows remain as
  -- anonymized safety/dispute records, but their user-authored content is no
  -- longer exposed to the other participant after deletion.
  delete from public.message_attachments a
   using public.messages m
   where a.message_id = m.id and m.sender_id = target_user_id;

  update public.messages
     set body = ''
   where sender_id = target_user_id;

  update public.reveal_requests
     set intro_message = case when buyer_id = target_user_id then null else intro_message end,
         decline_reason = case when seller_id = target_user_id then null else decline_reason end,
         buyer_contact = case when buyer_id = target_user_id then '{}'::text[] else buyer_contact end
   where buyer_id = target_user_id or seller_id = target_user_id;

  update public.ratings
     set text = null
   where rater_id = target_user_id or ratee_id = target_user_id;

  -- Pending Wanted work must close, while accepted offers retain their source,
  -- thread, completion, and rating references for the surviving participant.
  update public.wanted_offers
     set status = case
           when seller_id = target_user_id then 'withdrawn'
           else 'declined'
         end,
         resolved_at = coalesce(resolved_at, clock_timestamp()),
         updated_at = clock_timestamp()
   where status = 'pending'
     and (buyer_id = target_user_id or seller_id = target_user_id);

  -- Offer copy and private paths belong to the seller who authored them. Do
  -- not redact a surviving seller's accepted offer merely because its buyer
  -- deleted their account.
  update public.wanted_offers
     set description = '[deleted]',
         message = '[deleted]',
         photo_paths = '{}'::text[],
         updated_at = clock_timestamp()
   where seller_id = target_user_id;

  -- Wanted posts remain as referential anchors for accepted offers, reports,
  -- and message threads, but are removed from discovery and stripped down to
  -- the minimum anonymous transaction record.
  update public.wanted_posts
     set title = 'Deleted request',
         description = '[deleted]',
         location = '[deleted]',
         place_name = null,
         lat = null,
         lng = null,
         photo_urls = '{}'::text[],
         status = 'deleted',
         resolved_at = coalesce(resolved_at, clock_timestamp()),
         updated_at = clock_timestamp()
   where buyer_id = target_user_id;

  -- Listings are public content and must disappear. Their dependent saves and
  -- reminders cascade; historic requests keep their denormalized title.
  delete from public.listings where seller_id = target_user_id;

  -- Reports are deliberately retained. Their ON DELETE SET NULL target FKs and
  -- this anonymized profile anchor preserve moderation history without contact
  -- data or authored review text.
  update public.profiles
     set display_name = 'Deleted user',
         handle = 'deleted.' || replace(target_user_id::text, '-', ''),
         school_unit = null,
         class_year = null,
         bio = null,
         avatar_url = null,
         contact_method = null,
         contact_instagram = null,
         contact_email = null,
         heard_from = null,
         heard_from_detail = null,
         notify_prefs = '{}'::jsonb,
         last_digest_at = null
   where id = target_user_id;
end;
$$;

revoke all on function public.cleanup_deleted_account(uuid) from public, anon, authenticated;
grant execute on function public.cleanup_deleted_account(uuid) to service_role;
