-- TEMPORARY test allow-list: USC's Proofpoint gateway silently drops the auth
-- emails, so one non-USC address is permitted through for on-device testing
-- while USC deliverability is sorted. Everyone else is still @usc.edu-only.
-- Revert by re-running migration 020's function body (drop the allow-list).
create or replace function public.enforce_usc_email()
  returns trigger language plpgsql as $$
begin
  if new.email is null
     or (lower(new.email) !~ '^[^\s@]+@usc\.edu$'
         and lower(new.email) <> 'nicolexzha@gmail.com') then
    raise exception 'Flipd is USC-only: email must be a @usc.edu address';
  end if;
  return new;
end $$;
