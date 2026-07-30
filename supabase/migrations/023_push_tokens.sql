-- Expo push tokens for mobile notifications. One row per (user, device token);
-- a token is globally unique (a device belongs to one account at a time).
create table public.push_tokens (
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null,
  platform text,
  updated_at timestamptz not null default now(),
  primary key (user_id, token),
  unique (token)
);

create index push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

-- Owners manage only their own tokens. The server (service role) reads all
-- tokens when sending, bypassing RLS.
create policy "push_tokens_select_own" on public.push_tokens
  for select to authenticated using (user_id = auth.uid());
create policy "push_tokens_insert_own" on public.push_tokens
  for insert to authenticated with check (user_id = auth.uid());
create policy "push_tokens_update_own" on public.push_tokens
  for update to authenticated using (user_id = auth.uid());
create policy "push_tokens_delete_own" on public.push_tokens
  for delete to authenticated using (user_id = auth.uid());
