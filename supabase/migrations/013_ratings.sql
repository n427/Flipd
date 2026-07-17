-- Post-transaction ratings: one per party per completed reveal transaction.
create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.reveal_requests (id) on delete cascade,
  rater_id uuid not null references public.profiles (id),
  ratee_id uuid not null references public.profiles (id),
  score integer not null check (score between 1 and 5),
  text text,
  created_at timestamptz not null default now(),
  unique (request_id, rater_id)
);

create index ratings_ratee_idx on public.ratings (ratee_id, created_at desc);

alter table public.ratings enable row level security;
