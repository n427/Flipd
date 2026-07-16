alter table public.saves drop constraint saves_pkey;
alter table public.saves
  add column user_id uuid not null references public.profiles (id);
alter table public.saves add primary key (user_id, listing_id);
