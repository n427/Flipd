begin;

do $$ begin
  insert into auth.users (email) values ('alum@alumni.usc.edu');
  raise notice 'PASS: alumni.usc.edu insert allowed';
exception when others then raise exception 'FAIL: alumni.usc.edu blocked (%)', sqlerrm; end $$;

do $$ begin
  insert into auth.users (email) values ('alum@fake.alumni.usc.edu');
  raise exception 'FAIL: lookalike alumni domain allowed';
exception
  when raise_exception then
    if sqlerrm = 'FAIL: lookalike alumni domain allowed' then raise; end if;
    raise notice 'PASS: lookalike alumni domain blocked';
end $$;

rollback;
