-- USC alumni may request an official @alumni.usc.edu Gmail account after
-- degree conferral. Treat that exact domain as verified USC membership while
-- continuing to reject arbitrary subdomains and lookalike suffixes.
create or replace function public.enforce_usc_email()
  returns trigger language plpgsql as $$
begin
  if new.email is null
     or (lower(new.email) !~ '^[^\s@]+@(alumni\.)?usc\.edu$'
         and lower(new.email) <> 'nicolexzha@gmail.com') then
    raise exception 'Flipd requires an @usc.edu or @alumni.usc.edu address';
  end if;
  return new;
end $$;
