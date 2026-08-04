-- Backfill threads for requests approved BEFORE messaging existed.
--
-- Approving is what creates a thread (see the PATCH handler in
-- /api/reveals/[id]), so every request approved under the old contact-reveal
-- system has none. Those conversations are now unreachable: the UI no longer
-- shows contact details, and there is no thread to open instead.
--
-- One thread per approved or completed request, skipping any that already has
-- one. Safe to re-run: request_id is unique and the where-clause excludes rows
-- that already succeeded.
insert into public.message_threads (
  request_id, listing_id, listing_title, buyer_id, seller_id, created_at, last_message_at
)
select
  r.id,
  r.listing_id,
  -- Prefer the live listing title, fall back to the denormalized copy that
  -- survives deletion (008_requests_survive_delete.sql).
  coalesce(l.title, r.listing_title),
  r.buyer_id,
  r.seller_id,
  -- The thread began when the request was approved. resolved_at can be null on
  -- older rows, so fall back to when the request was made.
  coalesce(r.resolved_at, r.created_at),
  -- Null, not a timestamp: no messages have been sent yet, and a non-null value
  -- here would sort an empty thread above real conversations.
  null
from public.reveal_requests r
left join public.listings l on l.id = r.listing_id
where r.status in ('approved', 'completed')
  and not exists (
    select 1 from public.message_threads t where t.request_id = r.id
  )
  -- A request whose parties are somehow identical would violate the
  -- distinct-parties check; skip rather than fail the whole backfill.
  and r.buyer_id <> r.seller_id;
