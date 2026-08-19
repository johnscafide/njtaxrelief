create or replace function public.dispatch_due_integrations()
returns bigint
language plpgsql
security definer
set search_path = 'public', 'vault', 'extensions', 'pg_temp'
as $$
declare
  v_url text;
  v_token text;
  v_request_id bigint;
  v_due integer;
begin
  select count(*) into v_due
  from public.integration_deliveries
  where status = 'pending' and next_attempt_at <= now();

  if v_due = 0 then
    return null;
  end if;

  select project_url into v_url
  from public.integration_runtime_config
  where id = true;

  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = 'integration_delivery_worker_token'
  order by updated_at desc
  limit 1;

  if v_url is null or v_url !~ '^https://[a-z0-9-]+\.supabase\.co$' then
    raise exception 'Integration runtime URL is unavailable or invalid';
  end if;

  if v_token is null or length(v_token) < 20 then
    raise exception 'Integration delivery worker token is unavailable';
  end if;

  select net.http_post(
    url := v_url || '/functions/v1/integration-delivery-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-watchdog-worker-token', v_token
    ),
    body := jsonb_build_object('source', 'pg_cron'),
    timeout_milliseconds := 55000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.dispatch_due_integrations() from public, anon, authenticated;
grant execute on function public.dispatch_due_integrations() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'watchdog-integration-delivery-worker') then
    perform cron.unschedule('watchdog-integration-delivery-worker');
  end if;
  perform cron.schedule(
    'watchdog-integration-delivery-worker',
    '* * * * *',
    'select public.dispatch_due_integrations();'
  );
end;
$$;
