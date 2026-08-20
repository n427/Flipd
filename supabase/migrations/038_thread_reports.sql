-- Let conversation participants report a thread while preserving the existing
-- listing/profile report targets. The API verifies participation before insert.
alter table public.reports
  add column target_thread_id uuid references public.message_threads (id) on delete set null;

alter table public.reports drop constraint if exists reports_check;
-- The API requires exactly one target on insert. The database permits zero
-- afterward because each FK uses ON DELETE SET NULL so the moderation record
-- can survive content/account removal without blocking that removal.
alter table public.reports
  add constraint reports_at_most_one_target
  check (num_nonnulls(target_listing_id, target_user_id, target_thread_id) <= 1);
