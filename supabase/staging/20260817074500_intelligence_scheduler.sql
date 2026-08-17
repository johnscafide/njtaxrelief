do $$
begin
  perform cron.unschedule('watchdog-intelligence-staging-dispatch');
exception when others then
  null;
end $$;

select cron.schedule(
  'watchdog-intelligence-staging-dispatch',
  '*/10 * * * *',
  $$select public.dispatch_due_intelligence(
    'https://pxossnwmrygxlpxtstnl.supabase.co/functions/v1/intelligence-job-worker',
    5
  );$$
);
