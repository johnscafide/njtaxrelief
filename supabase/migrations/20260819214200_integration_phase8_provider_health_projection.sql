create or replace function private.integration_project_provider_health()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_state text;
  v_reason text;
  v_summary text;
  v_auth_issue boolean := false;
begin
  if new.sync_status = 'syncing' then return new; end if;

  if new.sync_status = 'error' then
    v_auth_issue := coalesce(new.last_error,'') ~* '(http_401|http_403|credential_missing|credential_unavailable|unauthorized|forbidden)';
    v_state := case when v_auth_issue or coalesce(new.consecutive_failures,0) >= 3 then 'failing' else 'degraded' end;
    v_reason := case when v_auth_issue then 'provider_auth_failed' else 'provider_sync_failed' end;
    v_summary := case when v_auth_issue then 'Provider authentication needs attention' else 'Provider synchronization is degraded' end;

    insert into public.integration_health_states(user_id,connection_id,component,state,reason_code,summary,details,observed_at,updated_at)
    values(new.user_id,new.connection_id,'provider_sync',v_state,v_reason,v_summary,
      jsonb_build_object('provider',new.provider,'consecutive_failures',coalesce(new.consecutive_failures,0),'last_error',new.last_error),now(),now())
    on conflict(user_id,connection_id,component) do update set state=excluded.state,reason_code=excluded.reason_code,summary=excluded.summary,details=excluded.details,observed_at=excluded.observed_at,updated_at=excluded.updated_at;

    if v_auth_issue then
      insert into public.integration_health_states(user_id,connection_id,component,state,reason_code,summary,details,observed_at,updated_at)
      values(new.user_id,new.connection_id,'auth','failing','provider_auth_failed','Provider credentials or authorization need attention',jsonb_build_object('provider',new.provider,'last_error',new.last_error),now(),now())
      on conflict(user_id,connection_id,component) do update set state=excluded.state,reason_code=excluded.reason_code,summary=excluded.summary,details=excluded.details,observed_at=excluded.observed_at,updated_at=excluded.updated_at;
    end if;
    return new;
  end if;

  if new.sync_status = 'idle' and new.last_success_at is not null then
    insert into public.integration_health_states(user_id,connection_id,component,state,reason_code,summary,details,observed_at,updated_at)
    values(new.user_id,new.connection_id,'provider_sync','healthy','provider_sync_succeeded','Provider synchronization is healthy',jsonb_build_object('provider',new.provider,'last_success_at',new.last_success_at,'records_synced_total',coalesce(new.records_synced_total,0)),coalesce(new.last_success_at,now()),now())
    on conflict(user_id,connection_id,component) do update set state=excluded.state,reason_code=excluded.reason_code,summary=excluded.summary,details=excluded.details,observed_at=excluded.observed_at,updated_at=excluded.updated_at;

    insert into public.integration_health_states(user_id,connection_id,component,state,reason_code,summary,details,observed_at,updated_at)
    values(new.user_id,new.connection_id,'auth','healthy','provider_auth_ok','Provider authentication is healthy',jsonb_build_object('provider',new.provider,'last_success_at',new.last_success_at),coalesce(new.last_success_at,now()),now())
    on conflict(user_id,connection_id,component) do update set state=excluded.state,reason_code=excluded.reason_code,summary=excluded.summary,details=excluded.details,observed_at=excluded.observed_at,updated_at=excluded.updated_at;
  end if;

  return new;
end;
$$;

revoke all on function private.integration_project_provider_health() from public, anon, authenticated;

drop trigger if exists integration_provider_health_projection on public.integration_provider_connections;
create trigger integration_provider_health_projection
after insert or update of sync_status,last_success_at,last_error,consecutive_failures on public.integration_provider_connections
for each row execute function private.integration_project_provider_health();
