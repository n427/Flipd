-- One row per user. id matches auth.users.id for real users; the demo
-- profile is a standalone row (no auth user), so there is deliberately
-- NO foreign key to auth.users.
create table public.profiles (
  id uuid primary key,
  display_name text,
  handle text unique,
  school_unit text,
  class_year text,
  contact_instagram text,
  contact_phone text,
  contact_email text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

-- Auto-create a profile stub on signup; onboarding fills the rest.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, contact_email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
