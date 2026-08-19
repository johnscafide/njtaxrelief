create or replace function public.dispatch_due_crm_resolution()
returns bigint
language plpgsql
security definer
set search_path=public,vault,net,pg_temp
as $$
declare
  v_token text;
  v_request_id bigint;
begin
  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name='integration_crm_resolution_worker_token'
  order by created_at desc limit 1;
  if v_token is null then raise exception 'CRM resolution worker token missing'; end if;

  select net.http_post(
    url := 'https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/integration-crm-resolution-worker',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-watchdog-resolution-worker-token',v_token
    ),
    body := '{"limit":20}'::jsonb,
    timeout_milliseconds := 120000
  ) into v_request_id;
  return v_request_id;
end;
$$;

revoke all on function public.dispatch_due_crm_resolution() from public,anon,authenticated;
grant execute on function public.dispatch_due_crm_resolution() to service_role;

do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname='watchdog-crm-resolution-worker' loop
    perform cron.unschedule(j.jobid);
  end loop;
  perform cron.schedule('watchdog-crm-resolution-worker','*/5 * * * *','select public.dispatch_due_crm_resolution();');
end $$;