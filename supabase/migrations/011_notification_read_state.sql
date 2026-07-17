-- Per-party read + dismiss state for the in-app notification feed.
-- Dismiss hides a row from the bell feed only; history views are unaffected.
alter table public.reveal_requests add column seller_seen_at timestamptz;
alter table public.reveal_requests add column buyer_seen_at timestamptz;
alter table public.reveal_requests add column seller_dismissed_at timestamptz;
alter table public.reveal_requests add column buyer_dismissed_at timestamptz;
