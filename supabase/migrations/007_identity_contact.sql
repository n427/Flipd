-- Identity + reusable contact method on profiles, and an avatars bucket.
alter table public.profiles add column bio text;
alter table public.profiles add column avatar_url text;
alter table public.profiles add column contact_method text
  check (contact_method in ('instagram', 'phone', 'email'));

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;
