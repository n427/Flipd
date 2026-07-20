-- Popup (event-category) listings: an event date/time window, plus buyers'
-- opt-in day-before reminders. Mirrors the saves table shape (003).
alter table public.listings
  add column if not exists event_start timestamptz,
  add column if not exists event_end   timestamptz;

create table if not exists public.popup_reminders (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  listing_id  uuid not null references public.listings (id) on delete cascade,
  reminded_at timestamptz,
  created_at  timestamptz not null default now(),
  primary key (user_id, listing_id)
);

alter table public.popup_reminders enable row level security;

create policy "popup_reminders self select"
  on public.popup_reminders for select
  using (auth.uid() = user_id);

create policy "popup_reminders self insert"
  on public.popup_reminders for insert
  with check (auth.uid() = user_id);

create policy "popup_reminders self delete"
  on public.popup_reminders for delete
  using (auth.uid() = user_id);
