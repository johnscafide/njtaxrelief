create extension if not exists pg_cron;

do $block$
declare v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname='watchdog-intelligence-dispatch' limit 1;
  if v_jobid is not null then perform cron.unschedule(v_jobid); end if;
end
$block$;

select cron.schedule(
  'watchdog-intelligence-dispatch',
  '*/5 * * * *',
  $job$select public.dispatch_due_intelligence('https://pxossnwmrygxlpxtstnl.supabase.co/functions/v1/intelligence-job-worker',5);$job$
);
