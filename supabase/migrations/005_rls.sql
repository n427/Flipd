-- Backstop only: the app reads/writes through server API routes using the
-- service role (bypasses RLS). Deny-by-default for the anon/authenticated
-- keys; the single read policy lets nothing sensitive out.
alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.saves enable row level security;
alter table public.reveal_requests enable row level security;

create policy "listings_read_active" on public.listings
  for select to authenticated using (archived = false);
