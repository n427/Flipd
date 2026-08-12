-- Removes the SMS channel (033_sms_consent.sql) and phone as a contact method.
-- Nothing is being switched off: sendSms had one caller and no producer ever
-- called canSms, so no user ever received a text.
--
-- This does NOT revert 033. That migration also replaced a blanket UPDATE grant
-- on profiles with an explicit column allowlist, and that hardening protects
-- every column. Only the SMS-specific parts are undone here.

-- The trigger reads phone_verified_at, so it must go before the column does.
drop trigger if exists profiles_clear_phone_verification on public.profiles;
drop function if exists public.clear_phone_verification();

drop table if exists public.phone_verifications;

-- Re-point rows whose primary method is about to stop existing. contact_email is
-- locked to the verified account and therefore always populated, so it is always
-- a safe target.
update public.profiles set contact_method = 'email' where contact_method = 'phone';

-- Narrow the constraint so the database agrees with the ContactMethod union in
-- src/lib/types.ts instead of permitting a value the app can no longer produce.
alter table public.profiles drop constraint if exists profiles_contact_method_check;
alter table public.profiles add constraint profiles_contact_method_check
  check (contact_method in ('instagram', 'email'));

alter table public.profiles
  drop column if exists phone_verified_at,
  drop column if exists sms_consent_at,
  drop column if exists contact_phone;

-- Dropping a column takes its grant with it, so this is a restatement rather
-- than a fix — it keeps the full writable allowlist readable in one place
-- instead of forcing a reader to diff it against 033.
grant update (
  display_name, handle, school_unit, class_year, bio, avatar_url,
  contact_method, contact_instagram, contact_email,
  heard_from, heard_from_detail, notify_prefs
) on public.profiles to authenticated;

-- Strip the now-dead per-event `sms` key. The coalesce is load-bearing:
-- jsonb_each over an empty '{}' yields zero rows and jsonb_object_agg over zero
-- rows returns NULL, which would blank out prefs for anyone holding '{}'.
update public.profiles
set notify_prefs = coalesce(
  (select jsonb_object_agg(key, value - 'sms') from jsonb_each(notify_prefs)),
  '{}'::jsonb
)
where notify_prefs is not null;
