-- Versioned, affirmative Terms and Privacy acceptance for mobile onboarding.
-- The timestamp is database-owned so a client cannot backdate consent.
create table public.legal_acceptances (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  accepted_at timestamptz not null default now()
);

alter table public.legal_acceptances enable row level security;

create policy "legal_acceptances_select_own" on public.legal_acceptances
  for select to authenticated using (user_id = auth.uid());
create policy "legal_acceptances_insert_own" on public.legal_acceptances
  for insert to authenticated with check (user_id = auth.uid());
create policy "legal_acceptances_update_own" on public.legal_acceptances
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.stamp_legal_acceptance()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.accepted_at := now();
  return new;
end;
$$;

create trigger legal_acceptances_stamp_time
  before insert or update on public.legal_acceptances
  for each row execute function public.stamp_legal_acceptance();

revoke all on function public.stamp_legal_acceptance() from public;
