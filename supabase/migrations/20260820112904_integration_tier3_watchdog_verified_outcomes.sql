create table if not exists public.integration_outcome_verification_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  observation_id uuid not null unique references public.integration_outcome_observations(id) on delete cascade,
  finding_id uuid not null references public.intelligence_findings(id) on delete cascade,
  outcome_event_id uuid not null references public.intelligence_outcome_events(id) on delete cascade,
  pams_pin text not null,
  verification_scope text not null default 'property_transaction' check (verification_scope='property_transaction'),
  candidate_type text not null default 'closed_sale_deed_corroboration' check (candidate_type='closed_sale_deed_corroboration'),
  rule_version text not null default 'tier3-closed-modiv-v1',
  state text not null default 'pending_corroboration' check (state in ('pending_corroboration','conflicting_evidence','eligible','promoted','rejected')),
  crm_occurred_at timestamptz not null,
  sale_date date,
  sale_price numeric,
  deed_book text,
  deed_page text,
  evidence_count integer not null default 0 check (evidence_count>=0),
  evidence_refs jsonb not null default '[]'::jsonb,
  reason_codes text[] not null default '{}',
  source_id text,
  source_ref text,
  matched_at timestamptz,
  promoted_at timestamptz,
  tier3_outcome_event_id uuid references public.intelligence_outcome_events(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists integration_outcome_verification_candidates_user_state_idx on public.integration_outcome_verification_candidates(user_id,state,updated_at desc);
create index if not exists integration_outcome_verification_candidates_pin_idx on public.integration_outcome_verification_candidates(user_id,pams_pin,crm_occurred_at desc);
create index if not exists integration_outcome_verification_candidates_finding_idx on public.integration_outcome_verification_candidates(finding_id);
create index if not exists integration_outcome_verification_candidates_tier3_event_idx on public.integration_outcome_verification_candidates(tier3_outcome_event_id) where tier3_outcome_event_id is not null;
alter table public.integration_outcome_verification_candidates enable row level security;
revoke all on public.integration_outcome_verification_candidates from anon,authenticated;
grant select,insert,update,delete on public.integration_outcome_verification_candidates to service_role;

create or replace function public.integration_ensure_tier3_candidate(p_observation_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_o public.integration_outcome_observations%rowtype;
  v_id uuid;
begin
  select * into v_o from public.integration_outcome_observations where id=p_observation_id;
  if not found or v_o.state<>'finding_linked' or v_o.mapped_outcome_type<>'closed' or v_o.finding_id is null or v_o.outcome_event_id is null or v_o.pams_pin is null then
    return null;
  end if;
  insert into public.integration_outcome_verification_candidates(
    user_id,observation_id,finding_id,outcome_event_id,pams_pin,crm_occurred_at,metadata
  ) values(
    v_o.user_id,v_o.id,v_o.finding_id,v_o.outcome_event_id,v_o.pams_pin,v_o.occurred_at,
    jsonb_build_object('source_observation_verification','system_observed','source_observation_trust_tier',2,'causal_attribution',false,'execution_allowed',false)
  )
  on conflict(observation_id) do update set
    finding_id=excluded.finding_id,
    outcome_event_id=excluded.outcome_event_id,
    pams_pin=excluded.pams_pin,
    crm_occurred_at=excluded.crm_occurred_at,
    updated_at=now()
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.integration_ensure_tier3_candidate(uuid) from public,anon,authenticated;
grant execute on function public.integration_ensure_tier3_candidate(uuid) to service_role;

create or replace function public.integration_reconcile_tier3_candidate(p_candidate_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_c public.integration_outcome_verification_candidates%rowtype;
  v_o public.integration_outcome_observations%rowtype;
  v_f public.intelligence_findings%rowtype;
  v_r public.intelligence_runs%rowtype;
  v_sale public.intelligence_material_change_candidates%rowtype;
  v_sale_date_text text;
  v_sale_date date;
  v_delta_days int;
  v_support_count int:=0;
  v_refs jsonb:='[]'::jsonb;
  v_sale_price numeric;
  v_deed_book text;
  v_deed_page text;
  v_tier3_id uuid;
  v_outcome_key text;
begin
  select * into v_c from public.integration_outcome_verification_candidates where id=p_candidate_id for update;
  if not found then return jsonb_build_object('ok',false,'reason','candidate_not_found'); end if;
  if v_c.state in ('promoted','rejected') then return jsonb_build_object('ok',true,'state',v_c.state,'tier3_outcome_event_id',v_c.tier3_outcome_event_id); end if;
  select * into v_o from public.integration_outcome_observations where id=v_c.observation_id and user_id=v_c.user_id;
  if not found or v_o.state<>'finding_linked' or v_o.mapped_outcome_type<>'closed' then
    update public.integration_outcome_verification_candidates set state='rejected',reason_codes=array['source_observation_no_longer_eligible'],updated_at=now() where id=v_c.id;
    return jsonb_build_object('ok',true,'state','rejected','reason','source_observation_no_longer_eligible');
  end if;

  select * into v_sale
  from public.intelligence_material_change_candidates m
  where m.user_id=v_c.user_id
    and m.pams_pin=v_c.pams_pin
    and m.event_type='deed_change'
    and m.marker_id='property.sale_date'
    and m.provider_kind='authoritative_source'
    and m.source_id='nj-parcels-modiv'
    and m.detected_at>=v_o.observed_at
    and m.detected_at<=v_o.observed_at+interval '180 days'
  order by m.detected_at desc,m.id desc
  limit 1;

  if not found then
    update public.integration_outcome_verification_candidates
       set state='pending_corroboration',evidence_count=0,evidence_refs='[]'::jsonb,reason_codes=array['authoritative_sale_date_change_missing'],updated_at=now()
     where id=v_c.id;
    return jsonb_build_object('ok',true,'state','pending_corroboration','reason','authoritative_sale_date_change_missing');
  end if;

  v_sale_date_text:=case when jsonb_typeof(v_sale.new_value)='string' then v_sale.new_value#>>'{}' else trim(both '"' from v_sale.new_value::text) end;
  if v_sale_date_text !~ '^\d{4}-\d{2}-\d{2}$' then
    update public.integration_outcome_verification_candidates
       set state='conflicting_evidence',source_id=v_sale.source_id,source_ref=v_sale.source_ref,reason_codes=array['authoritative_sale_date_unparseable'],updated_at=now()
     where id=v_c.id;
    return jsonb_build_object('ok',true,'state','conflicting_evidence','reason','authoritative_sale_date_unparseable');
  end if;
  v_sale_date:=v_sale_date_text::date;
  v_delta_days:=abs(v_sale_date-v_o.occurred_at::date);
  if v_sale_date>current_date+1 or v_delta_days>120 then
    update public.integration_outcome_verification_candidates
       set state='conflicting_evidence',sale_date=v_sale_date,source_id=v_sale.source_id,source_ref=v_sale.source_ref,
           reason_codes=array['sale_date_outside_verification_window'],metadata=metadata||jsonb_build_object('sale_date_delta_days',v_delta_days),updated_at=now()
     where id=v_c.id;
    return jsonb_build_object('ok',true,'state','conflicting_evidence','reason','sale_date_outside_verification_window','sale_date_delta_days',v_delta_days);
  end if;

  select count(distinct m.marker_id)::int,
         coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'material_change_candidate_id',m.id,'marker_id',m.marker_id,'old_value',m.old_value,'new_value',m.new_value,
           'detected_at',m.detected_at,'source_id',m.source_id,'source_ref',m.source_ref,'provider_kind',m.provider_kind,'materiality',m.materiality
         )) order by m.marker_id),'[]'::jsonb),
         max(case when m.marker_id='property.sale_price' and jsonb_typeof(m.new_value)='number' then (m.new_value::text)::numeric end),
         max(case when m.marker_id='property.deed_book' then case when jsonb_typeof(m.new_value)='string' then m.new_value#>>'{}' else trim(both '"' from m.new_value::text) end end),
         max(case when m.marker_id='property.deed_page' then case when jsonb_typeof(m.new_value)='string' then m.new_value#>>'{}' else trim(both '"' from m.new_value::text) end end)
    into v_support_count,v_refs,v_sale_price,v_deed_book,v_deed_page
  from public.intelligence_material_change_candidates m
  where m.user_id=v_c.user_id
    and m.pams_pin=v_c.pams_pin
    and m.event_type='deed_change'
    and m.marker_id in ('property.sale_date','property.sale_price','property.deed_book','property.deed_page')
    and m.provider_kind='authoritative_source'
    and m.source_id='nj-parcels-modiv'
    and m.detected_at between v_sale.detected_at-interval '5 minutes' and v_sale.detected_at+interval '5 minutes';

  if v_support_count<2 then
    update public.integration_outcome_verification_candidates
       set state='pending_corroboration',sale_date=v_sale_date,sale_price=v_sale_price,deed_book=v_deed_book,deed_page=v_deed_page,
           evidence_count=v_support_count,evidence_refs=v_refs,source_id=v_sale.source_id,source_ref=v_sale.source_ref,
           reason_codes=array['supporting_deed_change_missing'],matched_at=v_sale.detected_at,metadata=metadata||jsonb_build_object('sale_date_delta_days',v_delta_days),updated_at=now()
     where id=v_c.id;
    return jsonb_build_object('ok',true,'state','pending_corroboration','reason','supporting_deed_change_missing','evidence_count',v_support_count);
  end if;

  update public.integration_outcome_verification_candidates
     set state='eligible',sale_date=v_sale_date,sale_price=v_sale_price,deed_book=v_deed_book,deed_page=v_deed_page,
         evidence_count=v_support_count,evidence_refs=v_refs,source_id=v_sale.source_id,source_ref=v_sale.source_ref,
         reason_codes=array['authoritative_sale_date_changed','supporting_deed_change_present','sale_date_within_120_days'],
         matched_at=v_sale.detected_at,metadata=metadata||jsonb_build_object('sale_date_delta_days',v_delta_days,'promotion_prior_state','eligible'),updated_at=now()
   where id=v_c.id;

  select * into v_f from public.intelligence_findings where id=v_c.finding_id and user_id=v_c.user_id;
  select * into v_r from public.intelligence_runs where id=v_f.run_id and user_id=v_c.user_id;
  if not found then return jsonb_build_object('ok',false,'state','eligible','reason','intelligence_run_missing'); end if;

  v_outcome_key:='watchdog_verified:closed:'||v_c.id::text;
  insert into public.intelligence_outcome_events(
    finding_id,run_id,user_id,event_type,reason_code,notes,revenue_cents,artifact_type,artifact_id,
    model_key,model_version,facts_hash,signal_snapshot,assumption_snapshot,scenario_snapshot,metadata,occurred_at,outcome_key
  ) values(
    v_f.id,v_f.run_id,v_c.user_id,'closed','modiv_deed_sale_corroboration',null,null,
    'integration_outcome_verification_candidate',v_c.id::text,v_r.model_key,v_r.model_version,v_f.facts_hash,
    jsonb_build_object(
      'verification_candidate_id',v_c.id,'source_observation_id',v_o.id,'source_outcome_event_id',v_o.outcome_event_id,
      'pams_pin',v_c.pams_pin,'sale_date',v_sale_date,'sale_price',v_sale_price,'deed_book',v_deed_book,'deed_page',v_deed_page,
      'evidence_count',v_support_count,'evidence_refs',v_refs,'source_id',v_sale.source_id,'source_ref',v_sale.source_ref
    ),
    jsonb_build_object(
      'outcome_source','watchdog_verified','verification_status','watchdog_verified','trust_tier',3,
      'authority','governed_corroboration','verification_scope','property_transaction','property_fact_authority',false,
      'corroborating_property_fact_authority',true,'business_outcome_causal_attribution',false,
      'association_basis','verified_crm_property_link+single_proof_backed_finding+authoritative_modiv_deed_change'
    ),
    jsonb_build_object('opportunity_type',v_f.opportunity_type,'potential_impact',v_f.potential_impact,'recommended_actions',v_f.recommended_actions),
    jsonb_build_object(
      'outcome_source','watchdog_verified','verification_status','watchdog_verified','trust_tier',3,
      'authority','governed_corroboration','verification_scope','property_transaction','property_fact_authority',false,
      'corroborating_property_fact_authority',true,'causal_attribution',false,'execution_allowed',false,
      'source_observation_id',v_o.id,'verification_candidate_id',v_c.id,'source_id',v_sale.source_id,'source_ref',v_sale.source_ref,
      'rule_version',v_c.rule_version
    ),
    v_sale.detected_at,v_outcome_key
  ) on conflict(outcome_key) do nothing returning id into v_tier3_id;
  if v_tier3_id is null then select id into v_tier3_id from public.intelligence_outcome_events where user_id=v_c.user_id and outcome_key=v_outcome_key; end if;

  update public.integration_outcome_verification_candidates
     set state='promoted',tier3_outcome_event_id=v_tier3_id,promoted_at=now(),updated_at=now()
   where id=v_c.id;
  insert into public.integration_audit_log(user_id,connection_id,action,actor,details)
  values(v_c.user_id,v_o.connection_id,'intelligence.outcome.watchdog_verified','system',jsonb_build_object(
    'verification_candidate_id',v_c.id,'source_observation_id',v_o.id,'tier3_outcome_event_id',v_tier3_id,
    'finding_id',v_c.finding_id,'pams_pin',v_c.pams_pin,'event_type','closed','trust_tier',3,
    'verification_scope','property_transaction','rule_version',v_c.rule_version,'causal_attribution',false,'execution_allowed',false
  ));
  return jsonb_build_object('ok',true,'state','promoted','tier3_outcome_event_id',v_tier3_id,'evidence_count',v_support_count,'sale_date',v_sale_date,'execution_allowed',false);
end;
$$;
revoke execute on function public.integration_reconcile_tier3_candidate(uuid) from public,anon,authenticated;
grant execute on function public.integration_reconcile_tier3_candidate(uuid) to service_role;

create or replace function public.integration_tier3_on_system_observation()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_id uuid;
begin
  if new.state='finding_linked' and new.mapped_outcome_type='closed' and new.finding_id is not null and new.outcome_event_id is not null and new.pams_pin is not null then
    v_id:=public.integration_ensure_tier3_candidate(new.id);
    if v_id is not null then perform public.integration_reconcile_tier3_candidate(v_id); end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.integration_tier3_on_system_observation() from public,anon,authenticated;
drop trigger if exists integration_tier3_system_observation_trg on public.integration_outcome_observations;
create trigger integration_tier3_system_observation_trg
after insert or update of state,finding_id,outcome_event_id,pams_pin on public.integration_outcome_observations
for each row execute function public.integration_tier3_on_system_observation();

create or replace function public.integration_tier3_on_material_change()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_observation_id uuid; v_id uuid;
begin
  if new.event_type<>'deed_change' or new.provider_kind<>'authoritative_source' or new.source_id<>'nj-parcels-modiv' then return new; end if;
  for v_observation_id in
    select o.id from public.integration_outcome_observations o
    where o.user_id=new.user_id and o.pams_pin=new.pams_pin and o.state='finding_linked' and o.mapped_outcome_type='closed'
      and o.observed_at<=new.detected_at and o.observed_at>=new.detected_at-interval '180 days'
  loop
    v_id:=public.integration_ensure_tier3_candidate(v_observation_id);
    if v_id is not null then perform public.integration_reconcile_tier3_candidate(v_id); end if;
  end loop;
  return new;
end;
$$;
revoke execute on function public.integration_tier3_on_material_change() from public,anon,authenticated;
drop trigger if exists integration_tier3_material_change_trg on public.intelligence_material_change_candidates;
create trigger integration_tier3_material_change_trg
after insert on public.intelligence_material_change_candidates
for each row execute function public.integration_tier3_on_material_change();

create or replace function public.integration_tier3_verification_queue(p_limit integer default 30)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_limit int:=greatest(1,least(coalesce(p_limit,30),100));
  v_rows jsonb:='[]'::jsonb;
  v_pending int:=0; v_conflict int:=0; v_eligible int:=0; v_promoted int:=0; v_rejected int:=0;
  v_tier2_closed int:=0;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if not public.integration_automation_entitled() then raise exception 'Tier 3 verification requires Pro+ or Teams' using errcode='42501'; end if;
  select count(*) filter(where state='pending_corroboration')::int,
         count(*) filter(where state='conflicting_evidence')::int,
         count(*) filter(where state='eligible')::int,
         count(*) filter(where state='promoted')::int,
         count(*) filter(where state='rejected')::int
    into v_pending,v_conflict,v_eligible,v_promoted,v_rejected
  from public.integration_outcome_verification_candidates where user_id=v_user;
  select count(*)::int into v_tier2_closed from public.integration_outcome_observations where user_id=v_user and mapped_outcome_type='closed' and state='finding_linked';
  select coalesce(jsonb_agg(x order by x.updated_at desc),'[]'::jsonb) into v_rows from (
    select c.id,c.observation_id,c.finding_id,c.outcome_event_id,c.pams_pin,c.state,c.rule_version,c.crm_occurred_at,
           c.sale_date,c.sale_price,c.deed_book,c.deed_page,c.evidence_count,c.reason_codes,c.source_id,c.source_ref,c.matched_at,c.promoted_at,c.tier3_outcome_event_id,c.updated_at,
           f.opportunity_type,f.score,f.confidence,
           l.candidate_property_address as property_address,
           o.provider,o.previous_value,o.observed_value,o.observed_at
    from public.integration_outcome_verification_candidates c
    join public.integration_outcome_observations o on o.id=c.observation_id and o.user_id=v_user
    join public.intelligence_findings f on f.id=c.finding_id and f.user_id=v_user
    left join public.integration_crm_property_links l on l.id=o.crm_property_link_id and l.user_id=v_user
    where c.user_id=v_user
    order by c.updated_at desc
    limit v_limit
  ) x;
  return jsonb_build_object(
    'summary',jsonb_build_object(
      'tier2_closed_finding_linked',v_tier2_closed,'pending_corroboration',v_pending,'conflicting_evidence',v_conflict,
      'eligible',v_eligible,'promoted',v_promoted,'rejected',v_rejected,
      'verified_rate_pct',case when v_tier2_closed>0 then round(100.0*v_promoted/v_tier2_closed,1) else null end
    ),
    'rule',jsonb_build_object(
      'version','tier3-closed-modiv-v1','scope','property_transaction','eligible_outcome','closed',
      'required_source','NJ Parcels / MOD-IV','required_markers',jsonb_build_array('property.sale_date','one_or_more_supporting_deed_fields'),
      'sale_date_window_days',120,'causal_attribution',false,'execution_allowed',false
    ),
    'candidates',v_rows
  );
end;
$$;
revoke execute on function public.integration_tier3_verification_queue(integer) from public,anon;
grant execute on function public.integration_tier3_verification_queue(integer) to authenticated,service_role;

create or replace function public.integration_outcome_timeline(p_finding_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_f public.intelligence_findings%rowtype;
  v_events jsonb:='[]'::jsonb;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if not public.integration_automation_entitled() then raise exception 'Outcome timeline requires Pro+ or Teams' using errcode='42501'; end if;
  select * into v_f from public.intelligence_findings where id=p_finding_id and user_id=v_user;
  if not found then raise exception 'Finding not found' using errcode='P0002'; end if;
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('at',t.at,'kind',t.kind,'tier',t.tier,'title',t.title,'detail',t.detail,'authority',t.authority,'ref_id',t.ref_id,'metadata',t.metadata)) order by t.at,t.kind),'[]'::jsonb)
    into v_events
  from (
    select v_f.created_at as at,'finding.created'::text as kind,0::int as tier,'Intelligence finding created'::text as title,
           v_f.opportunity_type::text as detail,'watchdog_intelligence'::text as authority,v_f.id::text as ref_id,
           jsonb_build_object('score',v_f.score,'confidence',v_f.confidence,'evidence_coverage',v_f.evidence_coverage) as metadata
    union all
    select p.created_at,'proof.created',0,'Proof Envelope created','Decision provenance persisted','proof_layer',p.id::text,
           jsonb_build_object('facts_hash',p.facts_hash,'event_id',p.event_id)
    from public.integration_automation_proofs p where p.user_id=v_user and p.finding_id=v_f.id
    union all
    select l.verified_at,'relationship.verified',0,'CRM-to-property relationship verified',coalesce(l.link_method,'verified relationship'),'verified_relationship',l.id::text,
           jsonb_build_object('pams_pin',l.pams_pin,'confidence',l.confidence)
    from public.integration_crm_property_links l where l.user_id=v_user and l.pams_pin=v_f.pams_pin and l.status='verified' and l.verified_at is not null
    union all
    select o.observed_at,'outcome.system_observed',2,'CRM outcome observed',coalesce(o.previous_value,'—')||' → '||o.observed_value,'crm_system_observed',o.id::text,
           jsonb_build_object('provider',o.provider,'mapped_outcome_type',o.mapped_outcome_type,'occurred_at',o.occurred_at,'state',o.state)
    from public.integration_outcome_observations o where o.user_id=v_user and o.finding_id=v_f.id
    union all
    select c.matched_at,'verification.corroboration',3,'Authoritative corroboration evaluated',coalesce(c.sale_date::text,'Awaiting authoritative sale date'),'governed_corroboration',c.id::text,
           jsonb_build_object('state',c.state,'rule_version',c.rule_version,'evidence_count',c.evidence_count,'sale_price',c.sale_price,'deed_book',c.deed_book,'deed_page',c.deed_page,'reason_codes',c.reason_codes,'source_ref',c.source_ref)
    from public.integration_outcome_verification_candidates c where c.user_id=v_user and c.finding_id=v_f.id and c.matched_at is not null
    union all
    select e.occurred_at,'outcome.recorded',coalesce((e.metadata->>'trust_tier')::int,1),
           case when e.metadata->>'outcome_source'='watchdog_verified' then 'Tier 3 Watchdog verification recorded' when e.metadata->>'outcome_source'='crm_observed' then 'Tier 2 outcome linked to finding' else 'Tier 1 outcome recorded' end,
           e.event_type,coalesce(e.metadata->>'authority','contextual'),e.id::text,
           jsonb_build_object('outcome_source',e.metadata->>'outcome_source','verification_status',e.metadata->>'verification_status','reason_code',e.reason_code,'causal_attribution',coalesce((e.metadata->>'causal_attribution')::boolean,false),'artifact_type',e.artifact_type,'artifact_id',e.artifact_id)
    from public.intelligence_outcome_events e where e.user_id=v_user and e.finding_id=v_f.id
  ) t
  where t.at is not null;
  return jsonb_build_object('finding',jsonb_build_object('id',v_f.id,'pams_pin',v_f.pams_pin,'opportunity_type',v_f.opportunity_type,'score',v_f.score,'confidence',v_f.confidence),'events',v_events,'causal_attribution',false,'execution_allowed',false);
end;
$$;
revoke execute on function public.integration_outcome_timeline(uuid) from public,anon;
grant execute on function public.integration_outcome_timeline(uuid) to authenticated,service_role;

do $$ declare r record; v_id uuid; begin
  for r in select id from public.integration_outcome_observations where state='finding_linked' and mapped_outcome_type='closed' loop
    v_id:=public.integration_ensure_tier3_candidate(r.id);
    if v_id is not null then perform public.integration_reconcile_tier3_candidate(v_id); end if;
  end loop;
end $$;
