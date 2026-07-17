-- Trust guardrails: report capture + block relationships. Service-role access
-- only (RLS deny-all), consistent with the rest of the schema.
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id),
  target_listing_id uuid references public.listings (id) on delete set null,
  target_user_id uuid references public.profiles (id),
  reason text not null,
  created_at timestamptz not null default now(),
  check (target_listing_id is not null or target_user_id is not null)
);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id),
  blocked_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table public.reports enable row level security;
alter table public.blocks enable row level security;
