create or replace function public.integration_update_provider_control(
  p_provider text,
  p_outbound_enabled boolean default true,
  p_disabled_event_types text[] default '{}'::text[],
  p_reason text default null,
  p_external_writes_enabled boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_allowed boolean := false;
  v_provider text := left(trim(coalesce(p_provider,'')),80);
  v_exists boolean := false;
  v_disabled text[] := '{}'::text[];
  v_reason text := left(nullif(trim(coalesce(p_reason,'')),''),240);
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select exists(select 1 from public.profiles p where p.id=v_user and p.account_role='developer')
    or exists(select 1 from public.account_entitlements e where e.user_id=v_user and e.plan_tier in ('pro_plus','teams','developer') and e.subscription_status in ('active','trialing','past_due','cancel_scheduled')) into v_allowed;
  if not v_allowed then raise exception 'Watchdog Integration Operations requires Pro+ or Teams' using errcode='42501'; end if;
  if v_provider='' then raise exception 'provider is required' using errcode='23514'; end if;

  select exists(select 1 from public.integration_connections c where c.user_id=v_user and c.provider=v_provider and c.status<>'revoked') into v_exists;
  if not v_exists then raise exception 'Provider connection not found' using errcode='P0002'; end if;

  select coalesce(array_agg(distinct x),'{}'::text[]) into v_disabled
  from unnest(coalesce(p_disabled_event_types,'{}'::text[])) x
  where exists (
    select 1 from public.integration_connections c
    where c.user_id=v_user and c.provider=v_provider and c.status<>'revoked' and x=any(c.event_types)
  );

  insert into public.integration_provider_controls(user_id,provider,outbound_enabled,external_writes_enabled,disabled_event_types,reason,updated_by,updated_at)
  values(v_user,v_provider,coalesce(p_outbound_enabled,true),coalesce(p_external_writes_enabled,true),v_disabled,v_reason,'user',now())
  on conflict(user_id,provider) do update set
    outbound_enabled=excluded.outbound_enabled,
    external_writes_enabled=excluded.external_writes_enabled,
    disabled_event_types=excluded.disabled_event_types,
    reason=excluded.reason,
    updated_by='user',
    updated_at=now();

  insert into public.integration_audit_log(user_id,connection_id,action,actor,details)
  values(v_user,null,'provider.control.updated','user',jsonb_build_object(
    'provider',v_provider,
    'outbound_enabled',coalesce(p_outbound_enabled,true),
    'external_writes_enabled',coalesce(p_external_writes_enabled,true),
    'disabled_event_types',v_disabled,
    'reason',v_reason
  ));

  return jsonb_build_object(
    'provider',v_provider,
    'outbound_enabled',coalesce(p_outbound_enabled,true),
    'external_writes_enabled',coalesce(p_external_writes_enabled,true),
    'disabled_event_types',v_disabled,
    'reason',v_reason,
    'updated_at',now()
  );
end;
$$;

create or replace function public.integration_list_provider_controls()
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_allowed boolean := false;
  v_rows jsonb := '[]'::jsonb;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select exists(select 1 from public.profiles p where p.id=v_user and p.account_role='developer')
    or exists(select 1 from public.account_entitlements e where e.user_id=v_user and e.plan_tier in ('pro_plus','teams','developer') and e.subscription_status in ('active','trialing','past_due','cancel_scheduled')) into v_allowed;
  if not v_allowed then raise exception 'Watchdog Integration Operations requires Pro+ or Teams' using errcode='42501'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'provider',p.provider,
    'outbound_enabled',coalesce(c.outbound_enabled,true),
    'external_writes_enabled',coalesce(c.external_writes_enabled,true),
    'disabled_event_types',coalesce(c.disabled_event_types,'{}'::text[]),
    'reason',c.reason,
    'updated_at',c.updated_at,
    'connection_count',p.connection_count
  ) order by p.provider),'[]'::jsonb)
  into v_rows
  from (
    select provider,count(*)::int as connection_count
    from public.integration_connections
    where user_id=v_user and status<>'revoked'
    group by provider
  ) p
  left join public.integration_provider_controls c on c.user_id=v_user and c.provider=p.provider;

  return v_rows;
end;
$$;

revoke all on function public.integration_update_provider_control(text,boolean,text[],text,boolean) from public, anon;
revoke all on function public.integration_list_provider_controls() from public, anon;
grant execute on function public.integration_update_provider_control(text,boolean,text[],text,boolean) to authenticated;
grant execute on function public.integration_list_provider_controls() to authenticated;
