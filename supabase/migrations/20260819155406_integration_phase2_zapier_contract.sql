create table if not exists public.integration_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'zapier',
  label text not null default 'Zapier',
  key_prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default array['zapier.auth','triggers.manage','property.read','watchlist.write','crm.context.write']::text[],
  status text not null default 'active' check (status in ('active','revoked')),
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists integration_api_keys_user_status_idx
  on public.integration_api_keys(user_id,status,created_at desc);

alter table public.integration_api_keys enable row level security;
revoke all on public.integration_api_keys from anon, authenticated;
grant select,insert,update,delete on public.integration_api_keys to service_role;

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
set search_path = public, private, pg_temp
as $$
declare
  v_event_id uuid;
begin
  insert into public.integration_events(
    user_id,direction,event_type,event_key,source,status,payload,occurred_at
  ) values (
    p_user_id,'outbound',p_event_type,p_event_key,p_source,'queued',coalesce(p_payload,'{}'::jsonb),coalesce(p_occurred_at,now())
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
    on conflict(connection_id,event_id) do nothing;
  end if;

  return v_event_id;
end;
$$;
revoke all on function private.integration_enqueue_user_event(uuid,text,text,text,jsonb,timestamptz) from public;

create or replace function private.integration_enqueue_intelligence_finding()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  perform private.integration_enqueue_user_event(
    new.user_id,
    'intelligence.finding.created',
    'intelligence_finding:' || new.id::text,
    'watchdog.intelligence_findings',
    jsonb_strip_nulls(jsonb_build_object(
      'finding_id',new.id,
      'run_id',new.run_id,
      'pams_pin',new.pams_pin,
      'property_address',new.property_address,
      'opportunity_type',new.opportunity_type,
      'rank',new.rank,
      'score',new.score,
      'confidence',new.confidence,
      'evidence_coverage',new.evidence_coverage,
      'narrative',new.narrative,
      'created_at',new.created_at
    )),
    new.created_at
  );
  return new;
end;
$$;
revoke all on function private.integration_enqueue_intelligence_finding() from public;

drop trigger if exists trg_integration_intelligence_finding on public.intelligence_findings;
create trigger trg_integration_intelligence_finding
after insert on public.intelligence_findings
for each row execute function private.integration_enqueue_intelligence_finding();

create or replace function private.integration_enqueue_report_ready()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_report record;
begin
  select id,pams_pin,title,profession,preset,status
  into v_report
  from public.professional_reports
  where id=new.report_id and user_id=new.user_id
  limit 1;

  perform private.integration_enqueue_user_event(
    new.user_id,
    'report.ready',
    'report_version:' || new.id::text,
    'watchdog.professional_report_versions',
    jsonb_strip_nulls(jsonb_build_object(
      'report_id',new.report_id,
      'version_id',new.id,
      'version_number',new.version_number,
      'pams_pin',v_report.pams_pin,
      'title',v_report.title,
      'profession',v_report.profession,
      'preset',v_report.preset,
      'status',v_report.status,
      'created_at',new.created_at
    )),
    new.created_at
  );
  return new;
end;
$$;
revoke all on function private.integration_enqueue_report_ready() from public;

drop trigger if exists trg_integration_report_ready on public.professional_report_versions;
create trigger trg_integration_report_ready
after insert on public.professional_report_versions
for each row execute function private.integration_enqueue_report_ready();

create or replace function private.integration_enqueue_watchlist_alert()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if new.pams_pin is null then return new; end if;
  if not exists (
    select 1 from public.saved_properties s
    where s.user_id=new.user_id and s.pams_pin=new.pams_pin and s.kind='watch'
  ) then return new; end if;

  perform private.integration_enqueue_user_event(
    new.user_id,
    'watchlist.alert',
    'watchlist_alert:' || new.id::text,
    'watchdog.property_update_events',
    jsonb_strip_nulls(jsonb_build_object(
      'property_update_id',new.id,
      'pams_pin',new.pams_pin,
      'source_event_type',new.event_type,
      'severity',new.severity,
      'title',new.title,
      'summary',new.summary,
      'marker_id',new.marker_id,
      'old_value',new.old_value,
      'new_value',new.new_value,
      'delta_numeric',new.delta_numeric,
      'source_url',new.source_url,
      'occurred_at',new.occurred_at
    )),
    new.occurred_at
  );
  return new;
end;
$$;
revoke all on function private.integration_enqueue_watchlist_alert() from public;

drop trigger if exists trg_integration_watchlist_alert on public.property_update_events;
create trigger trg_integration_watchlist_alert
after insert on public.property_update_events
for each row execute function private.integration_enqueue_watchlist_alert();
