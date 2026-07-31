-- Buyers save listings to revisit. One row per (user, listing); saving is
-- idempotent (re-saving is a no-op via the composite PK).
create table public.saved_listings (
  user_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create index saved_listings_user_idx on public.saved_listings (user_id, created_at desc);

alter table public.saved_listings enable row level security;

-- A user manages only their own saves.
create policy "saved_listings_select_own" on public.saved_listings
  for select to authenticated using (user_id = auth.uid());
create policy "saved_listings_insert_own" on public.saved_listings
  for insert to authenticated with check (user_id = auth.uid());
create policy "saved_listings_delete_own" on public.saved_listings
  for delete to authenticated using (user_id = auth.uid());
