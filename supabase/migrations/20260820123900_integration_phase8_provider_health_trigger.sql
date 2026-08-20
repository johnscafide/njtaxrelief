create or replace function private.integration_provider_control_health()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_blocked boolean;
  v_reason_code text;
  v_summary text;
begin
  v_blocked := not new.outbound_enabled or not new.external_writes_enabled or cardinality(new.disabled_event_types)>0;
  v_reason_code := case
    when not new.outbound_enabled then 'provider_outbound_disabled'
    when not new.external_writes_enabled then 'provider_external_writes_disabled'
    when cardinality(new.disabled_event_types)>0 then 'provider_event_types_disabled'
    else 'provider_controls_enabled'
  end;
  v_summary := case when v_blocked then coalesce(new.reason,'Provider automation limited by Watchdog control plane') else 'Provider controls allow automation' end;

  insert into public.integration_health_states(user_id,connection_id,component,state,reason_code,summary,details,observed_at,updated_at)
  values(
    new.user_id,
    null,
    'provider:'||new.provider,
    case when v_blocked then 'disabled' else 'healthy' end,
    v_reason_code,
    v_summary,
    jsonb_build_object(
      'provider',new.provider,
      'outbound_enabled',new.outbound_enabled,
      'external_writes_enabled',new.external_writes_enabled,
      'disabled_event_types',new.disabled_event_types
    ),
    now(),
    now()
  )
  on conflict(user_id,component) where connection_id is null do update set
    state=excluded.state,
    reason_code=excluded.reason_code,
    summary=excluded.summary,
    details=excluded.details,
    observed_at=excluded.observed_at,
    updated_at=excluded.updated_at;

  return new;
end;
$$;

revoke all on function private.integration_provider_control_health() from public, anon, authenticated;

drop trigger if exists integration_provider_control_health_event on public.integration_provider_controls;
create trigger integration_provider_control_health_event
after insert or update of outbound_enabled,external_writes_enabled,disabled_event_types,reason on public.integration_provider_controls
for each row execute function private.integration_provider_control_health();

create or replace function private.integration_emit_health_change()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_connection_name text;
  v_provider text;
  v_previous_state text;
  v_event_key text;
begin
  if tg_op = 'UPDATE' and old.state is not distinct from new.state then return new; end if;
  if tg_op = 'INSERT' and new.state = 'healthy' then return new; end if;

  if new.connection_id is not null then
    select name, provider into v_connection_name, v_provider
    from public.integration_connections
    where id=new.connection_id and user_id=new.user_id;
  else
    v_provider := nullif(new.details->>'provider','');
  end if;

  v_previous_state := case when tg_op='UPDATE' then old.state else null end;
  v_event_key := 'integration-health:'||new.id::text||':'||floor(extract(epoch from new.observed_at)*1000)::bigint::text;

  perform private.integration_enqueue_user_event(
    new.user_id,
    'integration.health.changed',
    v_event_key,
    'watchdog.integration.health',
    jsonb_build_object(
      'health_state_id',new.id,
      'connection_id',new.connection_id,
      'connection_name',v_connection_name,
      'provider',v_provider,
      'component',new.component,
      'state',new.state,
      'previous_state',v_previous_state,
      'reason_code',new.reason_code,
      'summary',new.summary,
      'observed_at',new.observed_at
    ),
    new.observed_at
  );

  return new;
end;
$$;

revoke all on function private.integration_emit_health_change() from public, anon, authenticated;
