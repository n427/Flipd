-- Enforce USC-only signup at the database layer (defense in depth; the mobile
-- and web clients also check client-side, but that is bypassable). Blocks any
-- auth.users insert whose email doesn't match @usc.edu.
create or replace function public.enforce_usc_email()
  returns trigger language plpgsql as $$
begin
  if new.email is null or lower(new.email) !~ '^[^\s@]+@usc\.edu$' then
    raise exception 'Flipd is USC-only: email must be a @usc.edu address';
  end if;
  return new;
end $$;

drop trigger if exists trg_enforce_usc_email on auth.users;
create trigger trg_enforce_usc_email
  before insert on auth.users
  for each row execute function public.enforce_usc_email();
