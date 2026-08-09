-- SMS becomes a delivery channel. Two timestamps rather than one boolean,
-- because owning a number and agreeing to be texted are different facts and a
-- single flag cannot express "verified but opted out".
alter table public.profiles
  add column if not exists phone_verified_at timestamptz,
  add column if not exists sms_consent_at    timestamptz;

-- Pending verification codes. The code itself is never stored — only a hash —
-- so a leak of this table cannot be replayed. Short expiry plus an attempt cap
-- is what actually protects a 6-digit code; the hash protects it at rest.
create table if not exists public.phone_verifications (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  phone      text        not null,
  code_hash  text        not null,
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
