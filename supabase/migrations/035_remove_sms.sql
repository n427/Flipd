-- Removes the SMS channel (033_sms_consent.sql) and phone as a contact method.
-- Nothing is being switched off: sendSms had one caller and no producer ever
-- called canSms, so no user ever received a text.
--
-- This does NOT revert 033. That migration also replaced a blanket UPDATE grant
-- on profiles with an explicit column allowlist, and that hardening protects
-- every column. Only the SMS-specific parts are undone here.

-- Wrapped in a transaction: every statement below is transactional DDL/DML, so
-- this costs nothing. Without it, a partial apply (e.g. the `add constraint`
-- failing after the `drop constraint` has already committed) could leave
-- contact_method with NO check constraint at all — strictly weaker than
-- before, with the phone data already irreversibly gone.
begin;

-- The trigger reads phone_verified_at, so it must go before the column does.
drop trigger if exists profiles_clear_phone_verification on public.profiles;
drop function if exists public.clear_phone_verification();

drop table if exists public.phone_verifications;

-- Re-point rows whose primary method is about to stop existing. This mirrors
-- primaryMethod's precedence in src/lib/validation.ts (instagram, then email)
-- rather than assuming email is always available: contact_email is not
-- guaranteed non-null (src/app/api/me/route.ts maps an empty string to null,
-- and mobile writes the column directly). NULL is the honest answer when a
-- row has neither — it passes the new CHECK constraint below, so this is safe.
update public.profiles
set contact_method = case
  when contact_instagram is not null then 'instagram'
  when contact_email    is not null then 'email'
  else null
end
where contact_method = 'phone';

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
-- The jsonb_typeof guard below replaces a `notify_prefs is not null` check that
-- could never fire — the column has been `not null default '{}'` since
-- 009_notifications.sql — and additionally protects against non-object shapes.
update public.profiles
set notify_prefs = coalesce(
  (select jsonb_object_agg(key, case when jsonb_typeof(value) = 'object' then value - 'sms' else value end)
     from jsonb_each(notify_prefs)),
  '{}'::jsonb
)
where jsonb_typeof(notify_prefs) = 'object';

commit;
