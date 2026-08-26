-- NJW-51 operations wrapper: keep the Vault token inside Postgres for manual
-- canaries and service-only invocations of the existing automation function.
create or replace function public.invoke_agent_list_monitor_v1(
  p_limit integer default 5,
  p_suppress_delivery boolean default false
)
returns bigint
language plpgsql
security definer
set search_path = public, vault, net, pg_temp
as $$
declare
  v_token text;
  v_request_id bigint;
begin
  if p_limit < 1 or p_limit > 5 then
    raise exception 'monitor invocation limit must be between 1 and 5';
  end if;

  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = 'watchdog_agent_list_monitor_token'
  order by created_at desc
  limit 1;

  if v_token is null or length(v_token) < 32 then
    raise exception 'saved-list monitor token is unavailable';
  end if;

  select net.http_post(
    url := 'https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/watchdog-automation',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-watchdog-monitor-token', v_token
    ),
    body := jsonb_build_object(
      'mode', 'dynamic_lists',
      'limit', p_limit,
      'suppress_delivery', p_suppress_delivery
    ),
    timeout_milliseconds := 25000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.invoke_agent_list_monitor_v1(integer, boolean) from public, anon, authenticated;
grant execute on function public.invoke_agent_list_monitor_v1(integer, boolean) to service_role;
