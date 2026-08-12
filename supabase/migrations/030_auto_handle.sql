-- Auto-assign a profile handle so public URLs read as /u/nicole.zhang instead
-- of /u/d0000000-0000-4000-8000-000000000001.
--
-- Timing: a handle is derived from display_name, and the signup trigger
-- (001_profiles.sql) only inserts id + contact_email, so there is no name to
-- slugify at signup. The handle is therefore filled the moment a name first
-- lands on the row, which in practice is onboarding's PATCH /api/me.
--
-- Deliberately NOT derived from the email local part: that would publish part
-- of someone's @usc.edu address on a public profile, and this codebase treats
-- contact fields as never-exposed.

-- "Nicole Zhang" -> "nicole.zhang". Every run of non-alphanumerics collapses to
-- a single dot, then leading/trailing dots are trimmed. Returns null when
-- nothing usable survives (a name that is entirely emoji, say).
create or replace function public.slugify_handle(source text)
returns text
language sql
immutable
as $$
  select nullif(
    trim(both '.' from regexp_replace(lower(coalesce(source, '')), '[^a-z0-9]+', '.', 'g')),
    ''
  );
$$;

-- First free handle for this name. Collisions get a numeric suffix, so a second
-- Nicole Zhang becomes nicole.zhang2. for_id is excluded so re-running against a
-- row that already holds the handle does not bump it.
--
-- Two concurrent signups can still pick the same candidate and lose the race to
-- the unique index. The window is a few milliseconds and the loser surfaces as a
-- save error rather than a wrong handle, which is the safe direction to fail.
create or replace function public.unique_handle(source text, for_id uuid)
returns text
language plpgsql
stable
as $$
declare
  base text := left(coalesce(public.slugify_handle(source), 'trojan'), 24);
  candidate text := base;
  n int := 1;
begin
  while exists (
    select 1 from public.profiles p where p.handle = candidate and p.id <> for_id
  ) loop
    n := n + 1;
    candidate := base || n::text;
  end loop;
  return candidate;
end;
$$;

-- Fill the handle only when it is absent: an explicitly chosen handle always
-- wins, and renaming yourself later never rewrites a URL people may have shared.
create or replace function public.set_profile_handle()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.handle is null and new.display_name is not null then
    new.handle := public.unique_handle(new.display_name, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_set_handle on public.profiles;
create trigger profiles_set_handle
  before insert or update of display_name, handle on public.profiles
  for each row execute function public.set_profile_handle();

-- Backfill accounts that named themselves before this migration existed.
-- Row-by-row rather than one set-based UPDATE: each statement sees the handles
-- assigned by the previous one, so two identical display names resolve to
-- nicole.zhang and nicole.zhang2 instead of colliding. Safe to re-run; the
-- where-clause skips anyone who already has one.
do $$
declare r record;
begin
  for r in
    select id, display_name from public.profiles
    where handle is null and display_name is not null
    order by created_at
  loop
    update public.profiles set handle = public.unique_handle(r.display_name, r.id)
    where id = r.id;
  end loop;
end $$;
