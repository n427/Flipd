-- SMS becomes a delivery channel. Two timestamps rather than one boolean,
-- because owning a number and agreeing to be texted are different facts and a
-- single flag cannot express "verified but opted out".
alter table public.profiles
  add column if not exists phone_verified_at timestamptz,
  add column if not exists sms_consent_at    timestamptz;

-- Pending verification codes. The code itself is never stored — only a hash —
-- so a leak of this table cannot be replayed. Short expiry plus an attempt cap
-- is what actually protects a 6-digit code; the hash protects it at rest.
-- code_hash has no NOT-NULL constraint: a null hash means the code was used,
-- expired, or exhausted. The row is kept (not deleted) in that state purely so
-- its sent_at survives to keep enforcing the resend cooldown in
-- src/app/api/me/phone/start/route.ts.
create table if not exists public.phone_verifications (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  phone      text        not null,
  code_hash  text,
  expires_at timestamptz not null,
  attempts   int         not null default 0,
  sent_at    timestamptz not null default now()
);

-- One pending code per user: a new request replaces the old row, so an
-- abandoned code cannot be used later.
alter table public.phone_verifications enable row level security;

-- No policies on purpose. Only the service-role client touches this table, and
-- service role bypasses RLS. With RLS on and zero policies, a leaked anon key
-- reads nothing.

-- Changing the contact number must invalidate verification and consent. This
-- lives in the database, not in an API route, because mobile updates profiles
-- directly through Supabase (mobile/src/lib/listings.ts:657) and never passes
-- through /api/me. Route-level clearing would silently not fire for phones —
-- leaving a "verified" flag pointing at a number the user no longer owns.
create or replace function public.clear_phone_verification()
returns trigger
language plpgsql
as $$
begin
  if new.contact_phone is distinct from old.contact_phone then
    new.phone_verified_at := null;
    new.sms_consent_at    := null;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_clear_phone_verification on public.profiles;
create trigger profiles_clear_phone_verification
  before update on public.profiles
  for each row
  execute function public.clear_phone_verification();

-- RLS on profiles is row-level only (019_rls_policies.sql): a user may update
-- their OWN row, but nothing restricts WHICH columns. Mobile writes profiles
-- directly with the anon key, so without column grants a user could set
-- contact_phone to someone else's number and then stamp their own
-- phone_verified_at and sms_consent_at — self-granting every gate and texting
-- a stranger. Only the server (service_role, which bypasses these grants) may
-- write the consent columns.
revoke update on public.profiles from authenticated;
grant update (
  display_name, handle, school_unit, class_year, bio, avatar_url,
  contact_method, contact_instagram, contact_phone, contact_email,
  heard_from, heard_from_detail, notify_prefs
) on public.profiles to authenticated;
