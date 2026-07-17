-- Notification layer: per-event prefs, reminder tracking, and the cron/http
-- extensions the hourly sweep needs.
create extension if not exists pg_cron;
create extension if not exists pg_net;

alter table public.reveal_requests add column reminded_at timestamptz;
alter table public.profiles add column notify_prefs jsonb not null default '{}'::jsonb;
