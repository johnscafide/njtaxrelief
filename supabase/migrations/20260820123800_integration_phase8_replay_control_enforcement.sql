create or replace function public.integration_replay_delivery(p_delivery_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_allowed boolean := false;
  v_delivery public.integration_deliveries%rowtype;
  v_connection public.integration_connections%rowtype;
  v_event public.integration_events%rowtype;
  v_control public.integration_connection_controls%rowtype;
  v_provider_control public.integration_provider_controls%rowtype;
  v_reason text := left(nullif(trim(coalesce(p_reason,'')),''),240);
  v_next_count integer;
  v_next_max integer;
  v_request_id bigint;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select exists(select 1 from public.profiles p where p.id=v_user and p.account_role='developer')
    or exists(select 1 from public.account_entitlements e where e.user_id=v_user and e.plan_tier in ('pro_plus','teams','developer') and e.subscription_status in ('active','trialing','past_due','cancel_scheduled')) into v_allowed;
  if not v_allowed then raise exception 'Watchdog Integration Operations requires Pro+ or Teams' using errcode='42501'; end if;

  select * into v_delivery from public.integration_deliveries where id=p_delivery_id and user_id=v_user for update;
  if not found then raise exception 'Delivery not found' using errcode='P0002'; end if;
  if v_delivery.status not in ('failed','canceled') then raise exception 'Only failed or canceled deliveries can be manually replayed' using errcode='23514'; end if;

  select * into v_connection from public.integration_connections where id=v_delivery.connection_id and user_id=v_user;
  select * into v_event from public.integration_events where id=v_delivery.event_id and user_id=v_user;
  if v_connection.id is null or v_event.id is null or v_connection.status<>'active' or v_connection.direction not in ('outbound','bidirectional') or not(v_event.event_type=any(v_connection.event_types)) then
    raise exception 'Connection is not currently eligible for replay' using errcode='23514';
  end if;

  select * into v_provider_control from public.integration_provider_controls where user_id=v_user and provider=v_connection.provider;
  if v_provider_control.user_id is not null and (
    not v_provider_control.outbound_enabled
    or not v_provider_control.external_writes_enabled
    or v_event.event_type=any(v_provider_control.disabled_event_types)
  ) then
    raise exception 'Replay is blocked by the provider control plane' using errcode='23514';
  end if;

  select * into v_control from public.integration_connection_controls where connection_id=v_connection.id and user_id=v_user;
  if v_control.connection_id is not null and (
    not v_control.outbound_enabled
    or not v_control.external_writes_enabled
    or v_event.event_type=any(v_control.disabled_event_types)
  ) then
    raise exception 'Replay is blocked by the connection control plane' using errcode='23514';
  end if;

  v_next_count := coalesce(v_delivery.manual_replay_count,0)+1;
  v_next_max := greatest(coalesce(v_delivery.max_attempts,5),coalesce(v_delivery.attempt_count,0)+5);

  update public.integration_deliveries
     set status='pending',next_attempt_at=now(),max_attempts=v_next_max,last_error=null,delivered_at=null,
         manual_replay_count=v_next_count,last_replayed_at=now(),last_replayed_by='user',
         last_replay_reason=coalesce(v_reason,'Manual replay from Integration Center'),updated_at=now()
   where id=v_delivery.id;

  insert into public.integration_audit_log(user_id,connection_id,action,actor,details)
  values(v_user,v_connection.id,'delivery.manual_replay_queued','user',jsonb_build_object(
    'delivery_id',v_delivery.id,
    'event_id',v_event.id,
    'event_type',v_event.event_type,
    'reason',coalesce(v_reason,'Manual replay from Integration Center'),
    'replay_count',v_next_count,
    'idempotency_preserved',true,
    'provider_control_checked',true,
    'external_write_control_checked',true
  ));

  v_request_id := private.integration_kick_delivery_worker();
  return jsonb_build_object(
    'ok',true,
    'delivery_id',v_delivery.id,
    'event_id',v_event.id,
    'idempotency_key',v_event.id,
    'manual_replay_count',v_next_count,
    'worker_request_id',v_request_id,
    'message','Replay queued using the original governed event identity.'
  );
end;
$$;

revoke all on function public.integration_replay_delivery(uuid,text) from public, anon;
grant execute on function public.integration_replay_delivery(uuid,text) to authenticated;
