-- Reveal requests outlive listing deletion so buyers see a clean closure
-- instead of a vanished row. listing_title is snapshotted at delete time.
alter table public.reveal_requests alter column listing_id drop not null;
alter table public.reveal_requests drop constraint reveal_requests_listing_id_fkey;
alter table public.reveal_requests
  add constraint reveal_requests_listing_id_fkey
  foreign key (listing_id) references public.listings (id) on delete set null;
alter table public.reveal_requests add column listing_title text;
