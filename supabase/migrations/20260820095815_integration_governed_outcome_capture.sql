alter table public.intelligence_outcome_events add column if not exists outcome_key text;
create unique index if not exists intelligence_outcome_events_outcome_key_uidx on public.intelligence_outcome_events(outcome_key) where outcome_key is not null;

revoke all on public.intelligence_outcome_events from anon, authenticated;
drop policy if exists intelligence_outcome_events_owner_insert on public.intelligence_outcome_events;
drop policy if exists intelligence_outcome_events_owner_delete on public.intelligence_outcome_events;
drop policy if exists intelligence_outcome_events_owner_read on public.intelligence_outcome_events;

create or replace function public.integration_record_intelligence_outcome(
  p_finding_id uuid,
  p_event_type text,
  p_reason_code text default null,
  p_notes text default null,
  p_revenue_cents bigint default null,
  p_occurred_at timestamptz default now(),
  p_idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare
  v_user uuid:=auth.uid();
  v_f public.intelligence_findings%rowtype;
  v_r public.intelligence_runs%rowtype;
  v_type text:=lower(trim(coalesce(p_event_type,'')));
  v_when timestamptz:=coalesce(p_occurred_at,now());
  v_key text;
  v_id uuid;
  v_inserted boolean:=false;
  v_evidence_count int:=0;
  v_governed_count int:=0;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if not public.integration_automation_entitled() then raise exception 'Outcome capture requires Pro+ or Teams' using errcode='42501'; end if;
  if v_type not in ('reviewed','useful','not_relevant','contacted','appointment','client','under_contract','closed','dismissed','case_created','report_created','watch_started','campaign_prepared') then raise exception 'Unsupported outcome type' using errcode='23514'; end if;
  if p_reason_code is not null and (length(trim(p_reason_code))>80 or trim(p_reason_code)!~'^[a-zA-Z0-9_.-]+$') then raise exception 'Reason code must be 80 characters or fewer and use letters, numbers, dot, dash, or underscore' using errcode='23514'; end if;
  if p_notes is not null and length(p_notes)>1000 then raise exception 'Outcome note is limited to 1000 characters' using errcode='23514'; end if;
  if p_revenue_cents is not null and (p_revenue_cents<0 or p_revenue_cents>1000000000) then raise exception 'Revenue amount is outside the supported range' using errcode='23514'; end if;
  if p_revenue_cents is not null and v_type<>'closed' then raise exception 'Revenue can only be attached to a closed outcome' using errcode='23514'; end if;
  select * into v_f from public.intelligence_findings where id=p_finding_id and user_id=v_user;
  if not found then raise exception 'Finding not found' using errcode='P0002'; end if;
  select * into v_r from public.intelligence_runs where id=v_f.run_id and user_id=v_user;
  if not found then raise exception 'Intelligence run not found' using errcode='P0002'; end if;
  if v_when>now()+interval '5 minutes' then raise exception 'Outcome time cannot be in the future' using errcode='23514'; end if;
  if v_when<v_f.created_at-interval '1 minute' then raise exception 'Outcome cannot predate the Intelligence finding' using errcode='23514'; end if;
  if jsonb_typeof(coalesce(v_f.evidence,'[]'::jsonb))='array' then
    select count(*)::int,count(*) filter(where elem#>>'{lineage,provider_kind}'='derived_governed' and coalesce(elem#>>'{lineage,status}','available')='available')::int
      into v_evidence_count,v_governed_count from jsonb_array_elements(coalesce(v_f.evidence,'[]'::jsonb)) elem;
  end if;
  v_key:='user_attested:'||v_user::text||':'||coalesce(nullif(trim(p_idempotency_key),''),gen_random_uuid()::text);
  insert into public.intelligence_outcome_events(
    finding_id,run_id,user_id,event_type,reason_code,notes,revenue_cents,artifact_type,artifact_id,model_key,model_version,facts_hash,signal_snapshot,assumption_snapshot,scenario_snapshot,metadata,occurred_at,outcome_key
  ) values(
    v_f.id,v_f.run_id,v_user,v_type,nullif(trim(p_reason_code),''),nullif(trim(p_notes),''),p_revenue_cents,
    'watchdog_intelligence_finding',v_f.id::text,v_r.model_key,v_r.model_version,v_f.facts_hash,
    jsonb_strip_nulls(jsonb_build_object('finding_id',v_f.id,'pams_pin',v_f.pams_pin,'opportunity_type',v_f.opportunity_type,'score',v_f.score,'confidence',v_f.confidence,'evidence_coverage',v_f.evidence_coverage,'evidence_count',v_evidence_count,'governed_evidence_count',v_governed_count,'facts_hash',v_f.facts_hash)),
    jsonb_build_object('outcome_source','user_reported','verification_status','attested','trust_tier',1,'authority','contextual','governed_property_fact_authority',false,'does_not_mutate_property_facts',true),
    jsonb_strip_nulls(jsonb_build_object('opportunity_type',v_f.opportunity_type,'potential_impact',v_f.potential_impact,'recommended_actions',v_f.recommended_actions)),
    jsonb_build_object('outcome_source','user_reported','verification_status','attested','trust_tier',1,'authority','contextual','created_via','watchdog_proof_layer','outcome_key',v_key,'execution_allowed',false),
    v_when,v_key
  ) on conflict(outcome_key) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.intelligence_outcome_events where outcome_key=v_key and user_id=v_user and finding_id=v_f.id;
  else
    v_inserted:=true;
    insert into public.integration_audit_log(user_id,connection_id,action,actor,details)
      values(v_user,null,'intelligence.outcome.user_attested','user',jsonb_build_object('outcome_event_id',v_id,'finding_id',v_f.id,'event_type',v_type,'verification_status','attested','trust_tier',1,'property_fact_authority',false));
  end if;
  return jsonb_build_object('outcome_event_id',v_id,'finding_id',v_f.id,'event_type',v_type,'inserted',v_inserted,'outcome_source','user_reported','verification_status','attested','trust_tier',1,'property_fact_authority',false,'execution_allowed',false);
end; $$;

create or replace function public.integration_list_intelligence_outcomes(p_limit integer default 30)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_user uuid:=auth.uid(); v_limit int:=greatest(1,least(coalesce(p_limit,30),100)); v_rows jsonb;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if not public.integration_automation_entitled() then raise exception 'Outcome history requires Pro+ or Teams' using errcode='42501'; end if;
  select coalesce(jsonb_agg(x order by x.occurred_at desc),'[]'::jsonb) into v_rows from (
    select o.id,o.finding_id,o.event_type,o.reason_code,o.revenue_cents,o.occurred_at,o.outcome_key,
      coalesce(o.metadata->>'outcome_source','legacy') as outcome_source,
      coalesce(o.metadata->>'verification_status','unknown') as verification_status,
      coalesce((o.metadata->>'trust_tier')::int,0) as trust_tier,
      f.pams_pin,f.property_address,f.opportunity_type
    from public.intelligence_outcome_events o
    join public.intelligence_findings f on f.id=o.finding_id and f.user_id=v_user
    where o.user_id=v_user order by o.occurred_at desc limit v_limit
  ) x;
  return jsonb_build_object('outcomes',v_rows,'count',jsonb_array_length(v_rows),'execution_allowed',false);
end; $$;

revoke execute on function public.integration_record_intelligence_outcome(uuid,text,text,text,bigint,timestamptz,text) from public,anon;
revoke execute on function public.integration_list_intelligence_outcomes(integer) from public,anon;
grant execute on function public.integration_record_intelligence_outcome(uuid,text,text,text,bigint,timestamptz,text) to authenticated;
grant execute on function public.integration_list_intelligence_outcomes(integer) to authenticated;
