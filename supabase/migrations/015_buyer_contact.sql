-- Buyer's per-request choice of which contact methods to share on approval.
-- Mirror of listings.contact (text[]) for the seller side.
alter table public.reveal_requests
  add column if not exists buyer_contact text[] not null default '{}';
