-- Per-request offer amount and a terminal 'completed' stage after handoff.
alter table public.reveal_requests add column offer integer;
alter table public.reveal_requests drop constraint reveal_requests_status_check;
alter table public.reveal_requests
  add constraint reveal_requests_status_check
  check (status in ('pending', 'approved', 'declined', 'expired', 'completed'));
