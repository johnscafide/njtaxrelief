create schema if not exists private;

create or replace function private.watchdog_dispatch_intelligence_cron(p_max_dispatch integer default 5)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_worker_url text;
begin
  select decrypted_secret into v_worker_url
  from vault.decrypted_secrets
  where name='watchdog_intelligence_worker_url'
  limit 1;

  if nullif(v_worker_url,'') is null then
    return jsonb_build_object(
      'status','disabled',
      'reason','worker_url_not_configured',
      'checked_at',now()
    );
  end if;

  return public.dispatch_due_intelligence(v_worker_url,p_max_dispatch);
end
$function$;

revoke all on function private.watchdog_dispatch_intelligence_cron(integer) from public, anon, authenticated;
grant execute on function private.watchdog_dispatch_intelligence_cron(integer) to postgres, service_role;

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
  $job$select private.watchdog_dispatch_intelligence_cron(5);$job$
);
