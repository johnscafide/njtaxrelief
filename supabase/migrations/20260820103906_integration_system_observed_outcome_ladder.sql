create table if not exists public.integration_outcome_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  provider text not null,
  external_observation_key text not null,
  crm_context_id uuid not null references public.integration_crm_context(id) on delete cascade,
  crm_property_link_id uuid references public.integration_crm_property_links(id) on delete set null,
  pams_pin text,
  observation_type text not null,
  previous_value text,
  observed_value text not null,
  mapped_outcome_type text not null check (mapped_outcome_type in ('client','under_contract','closed')),
  occurred_at timestamptz not null,
  observed_at timestamptz not null default now(),
  verification_status text not null default 'system_observed' check (verification_status='system_observed'),
  trust_tier smallint not null default 2 check (trust_tier=2),
  authority text not null default 'contextual' check (authority='contextual'),
  property_fact_authority boolean not null default false check (property_fact_authority=false),
  state text not null default 'unresolved' check (state in ('unresolved','property_linked','finding_linked','ignored')),
  finding_id uuid references public.intelligence_findings(id) on delete set null,
  outcome_event_id uuid references public.intelligence_outcome_events(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,provider,external_observation_key)
);
create index if not exists integration_outcome_observations_user_state_idx on public.integration_outcome_observations(user_id,state,occurred_at desc);
create index if not exists integration_outcome_observations_context_idx on public.integration_outcome_observations(crm_context_id,occurred_at desc);
create index if not exists integration_outcome_observations_pin_idx on public.integration_outcome_observations(user_id,pams_pin,occurred_at desc) where pams_pin is not null;
create index if not exists integration_outcome_observations_finding_idx on public.integration_outcome_observations(finding_id) where finding_id is not null;
alter table public.integration_outcome_observations enable row level security;
revoke all on public.integration_outcome_observations from anon,authenticated;
grant select,insert,update,delete on public.integration_outcome_observations to service_role;

create or replace function public.integration_reconcile_system_observation(p_observation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_o public.integration_outcome_observations%rowtype;
  v_link_count int:=0;
  v_link_id uuid;
  v_pin text;
  v_finding_count int:=0;
  v_finding_id uuid;
  v_f public.intelligence_findings%rowtype;
  v_r public.intelligence_runs%rowtype;
  v_outcome_id uuid;
  v_outcome_key text;
begin
  select * into v_o from public.integration_outcome_observations where id=p_observation_id for update;
  if not found then return jsonb_build_object('ok',false,'reason','observation_not_found'); end if;
  if v_o.state='finding_linked' and v_o.outcome_event_id is not null then
    return jsonb_build_object('ok',true,'state',v_o.state,'outcome_event_id',v_o.outcome_event_id);
  end if;

  select count(*)::int,
         (array_agg(l.id order by l.verified_at desc nulls last,l.id))[1],
         (array_agg(l.pams_pin order by l.verified_at desc nulls last,l.id))[1]
    into v_link_count,v_link_id,v_pin
  from public.integration_crm_property_links l
  where l.user_id=v_o.user_id and l.crm_context_id=v_o.crm_context_id and l.status='verified';

  if v_link_count<>1 then
    update public.integration_outcome_observations
       set state='unresolved',crm_property_link_id=null,pams_pin=null,
           metadata=metadata||jsonb_build_object('relationship_candidate_count',v_link_count,'reconciliation_reason',case when v_link_count=0 then 'verified_relationship_missing' else 'multiple_verified_relationships' end),
           updated_at=now()
     where id=v_o.id;
    return jsonb_build_object('ok',true,'state','unresolved','verified_relationships',v_link_count);
  end if;

  update public.integration_outcome_observations
     set state='property_linked',crm_property_link_id=v_link_id,pams_pin=v_pin,
         metadata=metadata||jsonb_build_object('relationship_candidate_count',1,'relationship_basis','verified_crm_property_link','reconciliation_reason','awaiting_unique_proof_backed_finding'),
         updated_at=now()
   where id=v_o.id;

  with eligible as (
    select distinct p.finding_id
    from public.integration_automation_proofs p
    join public.intelligence_findings f on f.id=p.finding_id and f.user_id=v_o.user_id
    where p.user_id=v_o.user_id
      and p.pams_pin=v_pin
      and f.created_at<=v_o.occurred_at
      and f.created_at>=v_o.occurred_at-interval '180 days'
  )
  select count(*)::int,(array_agg(finding_id order by finding_id))[1]
    into v_finding_count,v_finding_id
  from eligible;

  if v_finding_count<>1 then
    update public.integration_outcome_observations
       set metadata=metadata||jsonb_build_object('proof_backed_finding_candidate_count',v_finding_count,'reconciliation_reason',case when v_finding_count=0 then 'proof_backed_finding_missing' else 'multiple_proof_backed_findings' end),updated_at=now()
     where id=v_o.id;
    return jsonb_build_object('ok',true,'state','property_linked','proof_backed_findings',v_finding_count);
  end if;

  select * into v_f from public.intelligence_findings where id=v_finding_id and user_id=v_o.user_id;
  select * into v_r from public.intelligence_runs where id=v_f.run_id and user_id=v_o.user_id;
  if not found then return jsonb_build_object('ok',false,'reason','intelligence_run_missing'); end if;

  v_outcome_key:='crm_observed:'||v_o.provider||':'||v_o.external_observation_key;
  insert into public.intelligence_outcome_events(
    finding_id,run_id,user_id,event_type,reason_code,notes,revenue_cents,artifact_type,artifact_id,
    model_key,model_version,facts_hash,signal_snapshot,assumption_snapshot,scenario_snapshot,metadata,occurred_at,outcome_key
  ) values(
    v_f.id,v_f.run_id,v_o.user_id,v_o.mapped_outcome_type,'crm_stage_transition',null,null,
    'integration_outcome_observation',v_o.id::text,v_r.model_key,v_r.model_version,v_f.facts_hash,
    jsonb_strip_nulls(jsonb_build_object(
      'observation_id',v_o.id,'provider',v_o.provider,'pams_pin',v_pin,'crm_property_link_id',v_link_id,
      'observation_type',v_o.observation_type,'previous_value',v_o.previous_value,'observed_value',v_o.observed_value,
      'source_occurred_at',v_o.occurred_at
    )),
    jsonb_build_object(
      'outcome_source','crm_observed','verification_status','system_observed','trust_tier',2,'authority','contextual',
      'property_fact_authority',false,'does_not_mutate_property_facts',true,'causal_attribution',false,
      'association_basis','verified_crm_property_link+single_proof_backed_finding'
    ),
    jsonb_strip_nulls(jsonb_build_object('opportunity_type',v_f.opportunity_type,'potential_impact',v_f.potential_impact,'recommended_actions',v_f.recommended_actions)),
    jsonb_build_object(
      'outcome_source','crm_observed','provider',v_o.provider,'verification_status','system_observed','trust_tier',2,
      'authority','contextual','property_fact_authority',false,'does_not_mutate_property_facts',true,
      'causal_attribution',false,'association_basis','verified_crm_property_link+single_proof_backed_finding',
      'observation_id',v_o.id,'execution_allowed',false
    ),
    v_o.occurred_at,v_outcome_key
  ) on conflict(outcome_key) do nothing returning id into v_outcome_id;

  if v_outcome_id is null then
    select id into v_outcome_id from public.intelligence_outcome_events where outcome_key=v_outcome_key and user_id=v_o.user_id;
  end if;

  update public.integration_outcome_observations
     set state='finding_linked',crm_property_link_id=v_link_id,pams_pin=v_pin,finding_id=v_f.id,outcome_event_id=v_outcome_id,
         metadata=metadata||jsonb_build_object('proof_backed_finding_candidate_count',1,'reconciliation_reason','linked','association_basis','verified_crm_property_link+single_proof_backed_finding','causal_attribution',false),updated_at=now()
   where id=v_o.id;

  insert into public.integration_audit_log(user_id,connection_id,action,actor,details)
  values(v_o.user_id,v_o.connection_id,'intelligence.outcome.crm_observed','system',jsonb_build_object(
    'observation_id',v_o.id,'outcome_event_id',v_outcome_id,'finding_id',v_f.id,'pams_pin',v_pin,
    'provider',v_o.provider,'event_type',v_o.mapped_outcome_type,'verification_status','system_observed','trust_tier',2,
    'property_fact_authority',false,'causal_attribution',false
  ));
  return jsonb_build_object('ok',true,'state','finding_linked','finding_id',v_f.id,'outcome_event_id',v_outcome_id,'execution_allowed',false);
end;
$$;
revoke execute on function public.integration_reconcile_system_observation(uuid) from public,anon,authenticated;
grant execute on function public.integration_reconcile_system_observation(uuid) to service_role;

create or replace function public.integration_capture_crm_stage_observation()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_mapped text;
  v_key text;
  v_id uuid;
begin
  if old.lead_stage is not distinct from new.lead_stage then return new; end if;
  if coalesce(new.context->>'provider','')<>'boldtrail' then return new; end if;
  if new.source_updated_at is null then return new; end if;
  if old.source_updated_at is not null and new.source_updated_at<=old.source_updated_at then return new; end if;
  v_mapped:=case lower(trim(coalesce(new.lead_stage,''))) when 'client' then 'client' when 'contract' then 'under_contract' when 'closed' then 'closed' else null end;
  if v_mapped is null then return new; end if;
  v_key:='stage:'||md5(new.connection_id::text||':'||new.external_contact_id||':'||new.source_updated_at::text||':'||lower(new.lead_stage));
  insert into public.integration_outcome_observations(
    user_id,connection_id,provider,external_observation_key,crm_context_id,observation_type,previous_value,observed_value,mapped_outcome_type,occurred_at,
    verification_status,trust_tier,authority,property_fact_authority,metadata
  ) values(
    new.user_id,new.connection_id,'boldtrail',v_key,new.id,'crm.lead_stage.changed',old.lead_stage,new.lead_stage,v_mapped,new.source_updated_at,
    'system_observed',2,'contextual',false,jsonb_build_object(
      'source','boldtrail.direct','source_updated_at',new.source_updated_at,'provider_status_code',new.context->'provider_status_code',
      'initial_snapshot',false,'property_fact_authority',false,'does_not_mutate_property_facts',true,'execution_allowed',false
    )
  ) on conflict(user_id,provider,external_observation_key) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.integration_outcome_observations where user_id=new.user_id and provider='boldtrail' and external_observation_key=v_key;
  end if;
  perform public.integration_reconcile_system_observation(v_id);
  return new;
end;
$$;
revoke execute on function public.integration_capture_crm_stage_observation() from public,anon,authenticated;
drop trigger if exists integration_crm_stage_observation_trg on public.integration_crm_context;
create trigger integration_crm_stage_observation_trg
after update of lead_stage,source_updated_at on public.integration_crm_context
for each row execute function public.integration_capture_crm_stage_observation();

create or replace function public.integration_reconcile_observations_on_relationship()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_id uuid;
begin
  if new.status<>'verified' then return new; end if;
  if tg_op='UPDATE' and old.status='verified' then return new; end if;
  for v_id in select id from public.integration_outcome_observations where user_id=new.user_id and crm_context_id=new.crm_context_id and state in ('unresolved','property_linked') loop
    perform public.integration_reconcile_system_observation(v_id);
  end loop;
  return new;
end;
$$;
revoke execute on function public.integration_reconcile_observations_on_relationship() from public,anon,authenticated;
drop trigger if exists integration_outcome_reconcile_relationship_trg on public.integration_crm_property_links;
create trigger integration_outcome_reconcile_relationship_trg
after insert or update of status on public.integration_crm_property_links
for each row execute function public.integration_reconcile_observations_on_relationship();

create or replace function public.integration_reconcile_observations_on_proof()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_id uuid;
begin
  for v_id in select id from public.integration_outcome_observations where user_id=new.user_id and pams_pin=new.pams_pin and state='property_linked' loop
    perform public.integration_reconcile_system_observation(v_id);
  end loop;
  return new;
end;
$$;
revoke execute on function public.integration_reconcile_observations_on_proof() from public,anon,authenticated;
drop trigger if exists integration_outcome_reconcile_proof_trg on public.integration_automation_proofs;
create trigger integration_outcome_reconcile_proof_trg
after insert or update of finding_id,pams_pin on public.integration_automation_proofs
for each row execute function public.integration_reconcile_observations_on_proof();

create or replace function public.integration_outcome_verification_ladder(p_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_limit int:=greatest(1,least(coalesce(p_limit,20),100));
  v_t1 int:=0; v_t2 int:=0; v_t2_linked int:=0; v_t2_unresolved int:=0; v_t3 int:=0;
  v_recent jsonb:='[]'::jsonb;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if not public.integration_automation_entitled() then raise exception 'Outcome verification requires Pro+ or Teams' using errcode='42501'; end if;
  select count(*)::int into v_t1 from public.intelligence_outcome_events where user_id=v_user and metadata->>'outcome_source'='user_reported';
  select count(*)::int,count(*) filter(where state='finding_linked')::int,count(*) filter(where state in ('unresolved','property_linked'))::int
    into v_t2,v_t2_linked,v_t2_unresolved from public.integration_outcome_observations where user_id=v_user;
  select count(*)::int into v_t3 from public.intelligence_outcome_events where user_id=v_user and metadata->>'outcome_source'='watchdog_verified';
  select coalesce(jsonb_agg(x order by x.occurred_at desc),'[]'::jsonb) into v_recent from (
    select o.id,o.provider,o.observation_type,o.previous_value,o.observed_value,o.mapped_outcome_type,o.occurred_at,o.state,o.verification_status,o.trust_tier,o.pams_pin,
           l.candidate_property_address as property_address,o.finding_id,o.outcome_event_id
    from public.integration_outcome_observations o
    left join public.integration_crm_property_links l on l.id=o.crm_property_link_id and l.user_id=v_user
    where o.user_id=v_user order by o.occurred_at desc limit v_limit
  ) x;
  return jsonb_build_object(
    'tiers',jsonb_build_object(
      'tier_1',jsonb_build_object('label','User attested','count',v_t1,'verification','attested','trust_tier',1),
      'tier_2',jsonb_build_object('label','System observed','count',v_t2,'linked_to_finding',v_t2_linked,'awaiting_reconciliation',v_t2_unresolved,'verification','system_observed','trust_tier',2),
      'tier_3',jsonb_build_object('label','Watchdog verified','count',v_t3,'verification','governed_verified','trust_tier',3)
    ),
    'recent_system_observations',v_recent,
    'causal_attribution',false,
    'property_fact_authority',false,
    'execution_allowed',false
  );
end;
$$;
revoke execute on function public.integration_outcome_verification_ladder(integer) from public,anon;
grant execute on function public.integration_outcome_verification_ladder(integer) to authenticated;
