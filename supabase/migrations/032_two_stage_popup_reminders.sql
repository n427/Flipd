-- Popup reminders go out twice now: about a day ahead, and about an hour
-- ahead. One timestamp cannot record two sends, so the existing flag becomes
-- the 24h one and a second column carries the 1h send.
--
-- RENAME rather than add-and-backfill: every existing non-null reminded_at was
-- a 24h-style send, so the rename preserves the exact history and no row can
-- be re-notified for something it already received.
alter table public.popup_reminders
  rename column reminded_at to reminded_24h_at;

alter table public.popup_reminders
  add column if not exists reminded_1h_at timestamptz;

-- Rows already reminded under the old single-stage scheme have a null 1h flag,
-- so they stay eligible for the 1h notice if their event is still upcoming.
-- That is intended: they were promised a reminder and the 1h one is new.
