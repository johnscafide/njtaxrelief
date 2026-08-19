create or replace function public.integration_operations_summary()
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_allowed boolean := false;
  v_since timestamptz := now() - interval '7 days';
  v_total integer := 0;
  v_delivered integer := 0;
  v_failed integer := 0;
  v_pending integer := 0;
  v_canceled integer := 0;
  v_retried integer := 0;
  v_replays integer := 0;
  v_unhealthy integer := 0;
  v_p50 numeric;
  v_p95 numeric;
  v_health jsonb := '[]'::jsonb;
  v_controls jsonb := '[]'::jsonb;
  v_connections jsonb := '[]'::jsonb;
  v_recent jsonb := '[]'::jsonb;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select exists(select 1 from public.profiles p where p.id=v_user and p.account_role='developer')
    or exists(select 1 from public.account_entitlements e where e.user_id=v_user and e.plan_tier in ('pro_plus','teams','developer') and e.subscription_status in ('active','trialing','past_due','cancel_scheduled')) into v_allowed;
  if not v_allowed then raise exception 'Watchdog Integration Operations requires Pro+ or Teams' using errcode='42501'; end if;
  select count(*)::int,count(*) filter (where d.status='delivered')::int,count(*) filter (where d.status='failed')::int,count(*) filter (where d.status in ('pending','processing'))::int,count(*) filter (where d.status='canceled')::int,count(*) filter (where d.attempt_count>1)::int,coalesce(sum(d.manual_replay_count),0)::int into v_total,v_delivered,v_failed,v_pending,v_canceled,v_retried,v_replays from public.integration_deliveries d where d.user_id=v_user and d.created_at>=v_since;
  select percentile_cont(0.5) within group (order by a.duration_ms),percentile_cont(0.95) within group (order by a.duration_ms) into v_p50,v_p95 from public.integration_delivery_attempts a join public.integration_deliveries d on d.id=a.delivery_id where d.user_id=v_user and d.created_at>=v_since and a.duration_ms is not null;
  select count(*)::int into v_unhealthy from public.integration_health_states h where h.user_id=v_user and h.state not in ('healthy','unknown');
  select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'connection_id',h.connection_id,'component',h.component,'state',h.state,'reason_code',h.reason_code,'summary',h.summary,'details',h.details,'observed_at',h.observed_at,'updated_at',h.updated_at) order by h.updated_at desc),'[]'::jsonb) into v_health from public.integration_health_states h where h.user_id=v_user;
  select coalesce(jsonb_agg(jsonb_build_object('connection_id',c.connection_id,'outbound_enabled',c.outbound_enabled,'external_writes_enabled',c.external_writes_enabled,'disabled_event_types',c.disabled_event_types,'reason',c.reason,'updated_by',c.updated_by,'updated_at',c.updated_at) order by c.updated_at desc),'[]'::jsonb) into v_controls from public.integration_connection_controls c where c.user_id=v_user;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'provider',c.provider,'status',c.status,'direction',c.direction,'event_types',c.event_types,'last_inbound_at',c.last_inbound_at,'last_outbound_at',c.last_outbound_at,'last_error',c.last_error,'updated_at',c.updated_at) order by c.updated_at desc),'[]'::jsonb) into v_connections from public.integration_connections c where c.user_id=v_user and c.status<>'revoked';
  select coalesce(jsonb_agg(x.row order by x.created_at desc),'[]'::jsonb) into v_recent from (select d.created_at,jsonb_build_object('id',d.id,'event_id',d.event_id,'connection_id',d.connection_id,'status',d.status,'attempt_count',d.attempt_count,'max_attempts',d.max_attempts,'last_attempt_at',d.last_attempt_at,'delivered_at',d.delivered_at,'last_http_status',d.last_http_status,'last_error',d.last_error,'created_at',d.created_at,'updated_at',d.updated_at,'manual_replay_count',d.manual_replay_count,'last_replayed_at',d.last_replayed_at,'last_replayed_by',d.last_replayed_by,'last_replay_reason',d.last_replay_reason,'can_replay',(d.status in ('failed','canceled')),'event',jsonb_build_object('event_type',e.event_type,'event_key',e.event_key,'source',e.source,'occurred_at',e.occurred_at),'connection',jsonb_build_object('name',c.name,'provider',c.provider)) as row from public.integration_deliveries d left join public.integration_events e on e.id=d.event_id left join public.integration_connections c on c.id=d.connection_id where d.user_id=v_user order by d.created_at desc limit 50) x;
  return jsonb_build_object('window_days',7,'metrics',jsonb_build_object('deliveries',v_total,'delivered',v_delivered,'failed',v_failed,'pending',v_pending,'canceled',v_canceled,'retried',v_retried,'manual_replays',v_replays,'success_rate',case when v_total>0 then round((v_delivered::numeric/v_total::numeric)*100,1) else null end,'p50_latency_ms',case when v_p50 is null then null else round(v_p50)::int end,'p95_latency_ms',case when v_p95 is null then null else round(v_p95)::int end,'unhealthy_states',v_unhealthy),'health',v_health,'controls',v_controls,'connections',v_connections,'recent_deliveries',v_recent);
end;
$$;

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
  v_reason text := left(nullif(trim(coalesce(p_reason,'')),''),240);
  v_next_count integer;
  v_next_max integer;
  v_request_id bigint;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select exists(select 1 from public.profiles p where p.id=v_user and p.account_role='developer') or exists(select 1 from public.account_entitlements e where e.user_id=v_user and e.plan_tier in ('pro_plus','teams','developer') and e.subscription_status in ('active','trialing','past_due','cancel_scheduled')) into v_allowed;
  if not v_allowed then raise exception 'Watchdog Integration Operations requires Pro+ or Teams' using errcode='42501'; end if;
  select * into v_delivery from public.integration_deliveries where id=p_delivery_id and user_id=v_user for update;
  if not found then raise exception 'Delivery not found' using errcode='P0002'; end if;
  if v_delivery.status not in ('failed','canceled') then raise exception 'Only failed or canceled deliveries can be manually replayed' using errcode='23514'; end if;
  select * into v_connection from public.integration_connections where id=v_delivery.connection_id and user_id=v_user;
  select * into v_event from public.integration_events where id=v_delivery.event_id and user_id=v_user;
  if v_connection.id is null or v_event.id is null or v_connection.status<>'active' or v_connection.direction not in ('outbound','bidirectional') or not(v_event.event_type=any(v_connection.event_types)) then raise exception 'Connection is not currently eligible for replay' using errcode='23514'; end if;
  select * into v_control from public.integration_connection_controls where connection_id=v_connection.id and user_id=v_user;
  if v_control.connection_id is not null and (not v_control.outbound_enabled or v_event.event_type=any(v_control.disabled_event_types)) then raise exception 'Replay is blocked by the connection control plane' using errcode='23514'; end if;
  v_next_count := coalesce(v_delivery.manual_replay_count,0)+1;
  v_next_max := greatest(coalesce(v_delivery.max_attempts,5),coalesce(v_delivery.attempt_count,0)+5);
  update public.integration_deliveries set status='pending',next_attempt_at=now(),max_attempts=v_next_max,last_error=null,delivered_at=null,manual_replay_count=v_next_count,last_replayed_at=now(),last_replayed_by='user',last_replay_reason=coalesce(v_reason,'Manual replay from Integration Center'),updated_at=now() where id=v_delivery.id;
  insert into public.integration_audit_log(user_id,connection_id,action,actor,details) values(v_user,v_connection.id,'delivery.manual_replay_queued','user',jsonb_build_object('delivery_id',v_delivery.id,'event_id',v_event.id,'event_type',v_event.event_type,'reason',coalesce(v_reason,'Manual replay from Integration Center'),'replay_count',v_next_count,'idempotency_preserved',true));
  v_request_id := private.integration_kick_delivery_worker();
  return jsonb_build_object('ok',true,'delivery_id',v_delivery.id,'event_id',v_event.id,'idempotency_key',v_event.id,'manual_replay_count',v_next_count,'worker_request_id',v_request_id,'message','Replay queued using the original governed event identity.');
end;
$$;

create or replace function public.integration_update_connection_control(p_connection_id uuid,p_outbound_enabled boolean default true,p_disabled_event_types text[] default '{}'::text[],p_reason text default null,p_external_writes_enabled boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_allowed boolean := false;
  v_connection public.integration_connections%rowtype;
  v_disabled text[] := '{}'::text[];
  v_reason text := left(nullif(trim(coalesce(p_reason,'')),''),240);
  v_blocked boolean;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select exists(select 1 from public.profiles p where p.id=v_user and p.account_role='developer') or exists(select 1 from public.account_entitlements e where e.user_id=v_user and e.plan_tier in ('pro_plus','teams','developer') and e.subscription_status in ('active','trialing','past_due','cancel_scheduled')) into v_allowed;
  if not v_allowed then raise exception 'Watchdog Integration Operations requires Pro+ or Teams' using errcode='42501'; end if;
  select * into v_connection from public.integration_connections where id=p_connection_id and user_id=v_user and status<>'revoked';
  if not found then raise exception 'Connection not found' using errcode='P0002'; end if;
  select coalesce(array_agg(distinct x),'{}'::text[]) into v_disabled from unnest(coalesce(p_disabled_event_types,'{}'::text[])) x where x=any(v_connection.event_types);
  insert into public.integration_connection_controls(connection_id,user_id,outbound_enabled,external_writes_enabled,disabled_event_types,reason,updated_by,updated_at) values(v_connection.id,v_user,coalesce(p_outbound_enabled,true),coalesce(p_external_writes_enabled,true),v_disabled,v_reason,'user',now()) on conflict(connection_id) do update set user_id=excluded.user_id,outbound_enabled=excluded.outbound_enabled,external_writes_enabled=excluded.external_writes_enabled,disabled_event_types=excluded.disabled_event_types,reason=excluded.reason,updated_by='user',updated_at=now();
  v_blocked := not coalesce(p_outbound_enabled,true) or cardinality(v_disabled)>0;
  insert into public.integration_health_states(user_id,connection_id,component,state,reason_code,summary,details,observed_at,updated_at) values(v_user,v_connection.id,'connection',case when v_blocked then 'disabled' else 'healthy' end,case when v_blocked then case when not coalesce(p_outbound_enabled,true) then 'outbound_disabled' else 'event_types_disabled' end else 'controls_enabled' end,case when v_blocked then coalesce(v_reason,'Automation delivery limited by Watchdog control plane') else 'Connection controls allow outbound automation' end,jsonb_build_object('disabled_event_types',v_disabled,'outbound_enabled',coalesce(p_outbound_enabled,true)),now(),now()) on conflict(user_id,connection_id,component) do update set state=excluded.state,reason_code=excluded.reason_code,summary=excluded.summary,details=excluded.details,observed_at=excluded.observed_at,updated_at=excluded.updated_at;
  insert into public.integration_audit_log(user_id,connection_id,action,actor,details) values(v_user,v_connection.id,'connection.control.updated','user',jsonb_build_object('outbound_enabled',coalesce(p_outbound_enabled,true),'external_writes_enabled',coalesce(p_external_writes_enabled,true),'disabled_event_types',v_disabled,'reason',v_reason));
  return jsonb_build_object('connection_id',v_connection.id,'outbound_enabled',coalesce(p_outbound_enabled,true),'external_writes_enabled',coalesce(p_external_writes_enabled,true),'disabled_event_types',v_disabled,'reason',v_reason,'updated_at',now());
end;
$$;

revoke all on function public.integration_operations_summary() from public, anon;
revoke all on function public.integration_replay_delivery(uuid,text) from public, anon;
revoke all on function public.integration_update_connection_control(uuid,boolean,text[],text,boolean) from public, anon;
grant execute on function public.integration_operations_summary() to authenticated;
grant execute on function public.integration_replay_delivery(uuid,text) to authenticated;
grant execute on function public.integration_update_connection_control(uuid,boolean,text[],text,boolean) to authenticated;
