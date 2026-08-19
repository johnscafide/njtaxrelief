create or replace function public.integration_kick_provider_sync(p_connection_id uuid, p_trigger text default 'manual')
returns bigint
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  return private.integration_kick_provider_worker(p_connection_id, p_trigger);
end;
$$;
revoke all on function public.integration_kick_provider_sync(uuid,text) from public, anon, authenticated;
grant execute on function public.integration_kick_provider_sync(uuid,text) to service_role;
