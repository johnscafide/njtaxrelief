alter table public.integration_api_keys
  alter column scopes set default array[
    'zapier.auth',
    'triggers.manage',
    'property.read',
    'watchlist.write',
    'crm.context.write',
    'intelligence.read',
    'intelligence.run'
  ]::text[];

create or replace function private.integration_enqueue_user_event(
  p_user_id uuid,
  p_event_type text,
  p_event_key text,
  p_source text,
  p_payload jsonb,
  p_occurred_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  v_event_id uuid;
begin
  insert into public.integration_events(
    user_id,direction,event_type,event_key,source,status,payload,occurred_at
  )
  values(
    p_user_id,'outbound',p_event_type,p_event_key,p_source,'queued',
    coalesce(p_payload,'{}'::jsonb),coalesce(p_occurred_at,now())
  )
  on conflict do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select id into v_event_id
    from public.integration_events
    where user_id=p_user_id
      and connection_id is null
      and direction='outbound'
      and event_key=p_event_key
    limit 1;
  end if;

  if v_event_id is not null then
    insert into public.integration_deliveries(event_id,connection_id,user_id,status,next_attempt_at)
    select v_event_id,c.id,p_user_id,'pending',now()
    from public.integration_connections c
    where c.user_id=p_user_id
      and c.status='active'
      and c.direction in ('outbound','bidirectional')
      and c.outbound_url is not null
      and p_event_type=any(c.event_types)
      and (
        p_event_type <> 'intelligence.finding.created'
        or c.intelligence_access is true
      )
    on conflict(connection_id,event_id) do nothing;
  end if;

  return v_event_id;
end;
$function$;
