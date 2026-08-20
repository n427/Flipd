-- Privileged, idempotent database cleanup for in-app account deletion.
-- The auth identity and Storage objects are removed by the server route after
-- it authenticates the caller; clients cannot execute this function directly.
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

  -- Listings are public content and must disappear. Their dependent saves and
  -- reminders cascade; historic requests keep their denormalized title.
  delete from public.listings where seller_id = target_user_id;

  -- Preserve the UUID only as a referential anchor for retained safety rows.
  -- public_profiles will show a generic deleted identity with no contact data.
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
