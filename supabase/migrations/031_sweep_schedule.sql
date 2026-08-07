-- Hourly sweep, scheduled in Postgres rather than vercel.json. Vercel's Hobby
-- plan caps crons at once per day, which cannot support the 1h popup-reminder
-- lead time; pg_cron is free at any frequency.
--
-- Secrets come from Vault so no key is committed. Create them once with:
--   select vault.create_secret('<app url>',      'app_url');
--   select vault.create_secret('<cron secret>',  'cron_secret');
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Idempotent: unschedule first so re-running this migration doesn't stack jobs.
select cron.unschedule('flipd-sweep-hourly')
where exists (select 1 from cron.job where jobname = 'flipd-sweep-hourly');

select cron.schedule(
  'flipd-sweep-hourly',
  '0 * * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url')
           || '/api/cron/sweep',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    -- net.http_get defaults timeout_milliseconds to 1000, which is far too short to cover a
    -- Vercel cold start plus the route's own work (a per-row profile query, a Supabase
    -- auth.admin.getUserById call, and a Resend POST). Without this the request is aborted
    -- before the route can finish.
    timeout_milliseconds := 30000
  );
  $$
);
