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
  -- Keep the existing 5-minute scheduler, but avoid an Edge Function call
  -- unless there is resolution work due now or a new active BoldTrail
  -- CRM context that has not been seeded into the resolution queue yet.
  if not exists (
    select 1
    from public.integration_crm_resolution_state s
    join public.integration_provider_connections p
      on p.connection_id = s.connection_id
     and p.user_id = s.user_id
    join public.integration_connections c
      on c.id = s.connection_id
     and c.user_id = s.user_id
    where p.provider = 'boldtrail'
      and p.sync_status <> 'revoked'
      and c.status = 'active'
      and s.detail_status in ('pending','error')
      and (s.next_attempt_at is null or s.next_attempt_at <= now())
  ) and not exists (
    select 1
    from public.integration_crm_context ctx
    join public.integration_provider_connections p
      on p.connection_id = ctx.connection_id
     and p.user_id = ctx.user_id
    join public.integration_connections c
      on c.id = ctx.connection_id
     and c.user_id = ctx.user_id
    left join public.integration_crm_resolution_state s
      on s.crm_context_id = ctx.id
    where p.provider = 'boldtrail'
      and p.sync_status <> 'revoked'
      and c.status = 'active'
      and s.crm_context_id is null
  ) then
    return null;
  end if;

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
