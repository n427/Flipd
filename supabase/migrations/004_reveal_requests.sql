create table public.reveal_requests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  buyer_id uuid not null references public.profiles (id),
  seller_id uuid not null references public.profiles (id),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '72 hours',
  resolved_at timestamptz
);

-- One live (pending/approved) request per buyer per listing.
create unique index reveal_requests_live_uniq
  on public.reveal_requests (listing_id, buyer_id)
  where status in ('pending', 'approved');

create index reveal_requests_seller_idx on public.reveal_requests (seller_id, status);
create index reveal_requests_buyer_idx on public.reveal_requests (buyer_id);
