-- USC-only signup trigger assertions (migration 020). Run against a THROWAWAY
-- database with a minimal auth.users skeleton + the 020 function/trigger applied.
-- Verified 2026-07-28 on isolated local Postgres: all three assertions PASS.

do $$ begin
  insert into auth.users (email) values ('trojan@usc.edu');
  raise notice 'PASS: usc.edu insert allowed';
exception when others then raise notice 'FAIL: usc.edu insert blocked (%)', sqlerrm; end $$;

do $$ begin
  insert into auth.users (email) values ('someone@gmail.com');
  raise notice 'FAIL: non-USC insert allowed (should be blocked)';
exception when others then raise notice 'PASS: non-USC insert blocked (%)', sqlerrm; end $$;

do $$ begin
  insert into auth.users (email) values ('Trojan@USC.EDU');
  raise notice 'PASS: case-insensitive usc.edu allowed';
exception when others then raise notice 'FAIL: uppercase usc.edu blocked (%)', sqlerrm; end $$;
