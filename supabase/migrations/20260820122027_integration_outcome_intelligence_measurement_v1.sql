create table if not exists public.integration_outcome_measurement_epochs (
  epoch_key text primary key,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  maturity_days integer not null default 30 check (maturity_days between 1 and 3650),
  verification_window_days integer not null default 180 check (verification_window_days between 1 and 3650),
  tier2_contract text not null default 'system-observed-v1',
  tier3_rule_version text not null default 'tier3-closed-modiv-v1',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at > started_at)
);

alter table public.integration_outcome_measurement_epochs enable row level security;
revoke all on public.integration_outcome_measurement_epochs from anon, authenticated;
grant select, insert, update, delete on public.integration_outcome_measurement_epochs to service_role;

insert into public.integration_outcome_measurement_epochs(
  epoch_key, started_at, maturity_days, verification_window_days, tier2_contract, tier3_rule_version, metadata
)
values(
  'outcome-intelligence-v1', now(), 30, 180, 'system-observed-v1', 'tier3-closed-modiv-v1',
  jsonb_build_object(
    'purpose','Begin verified-outcome measurement only after outcome telemetry and Tier 3 verification are production-ready',
    'historical_findings_are_baseline_only',true,
    'causal_attribution',false,
    'execution_allowed',false
  )
)
on conflict (epoch_key) do nothing;

create or replace function public.integration_outcome_intelligence_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = 'public','private','pg_temp'
as $$
declare
  v_user uuid := auth.uid();
  v_epoch public.integration_outcome_measurement_epochs%rowtype;
  v_hist_findings int := 0;
  v_hist_properties int := 0;
  v_hist_proofs int := 0;
  v_hist_verified_relationships int := 0;
  v_hist_verified_properties int := 0;
  v_cohort_findings int := 0;
  v_cohort_properties int := 0;
  v_mature_findings int := 0;
  v_proof_findings int := 0;
  v_relationship_findings int := 0;
  v_t1_events int := 0;
  v_t1_findings int := 0;
  v_t2_events int := 0;
  v_t2_findings int := 0;
  v_t2_unlinked int := 0;
  v_t3_events int := 0;
  v_t3_findings int := 0;
  v_mature_t1_findings int := 0;
  v_mature_t2_findings int := 0;
  v_mature_t3_findings int := 0;
  v_closed_t2 int := 0;
  v_pending int := 0;
  v_eligible int := 0;
  v_conflicts int := 0;
  v_rejected int := 0;
  v_promoted int := 0;
  v_expired_unverified int := 0;
  v_settled int := 0;
  v_avg_finding_outcome_hours numeric;
  v_p50_finding_outcome_hours numeric;
  v_avg_closed_verify_hours numeric;
  v_p50_closed_verify_hours numeric;
  v_opportunity jsonb := '[]'::jsonb;
  v_score jsonb := '[]'::jsonb;
  v_confidence jsonb := '[]'::jsonb;
  v_models jsonb := '[]'::jsonb;
  v_outcome_types jsonb := '[]'::jsonb;
  v_reason_codes jsonb := '[]'::jsonb;
  v_stage text;
begin
  if v_user is null then
    raise exception 'Sign in required' using errcode='42501';
  end if;
  if not public.integration_automation_entitled() then
    raise exception 'Outcome Intelligence requires Pro+ or Teams' using errcode='42501';
  end if;

  select * into v_epoch
  from public.integration_outcome_measurement_epochs
  where started_at <= now() and (ended_at is null or ended_at > now())
  order by started_at desc
  limit 1;
  if not found then
    raise exception 'No active outcome measurement epoch' using errcode='P0002';
  end if;

  select count(*)::int, count(distinct pams_pin)::int
    into v_hist_findings, v_hist_properties
  from public.intelligence_findings
  where user_id=v_user;

  select count(distinct finding_id)::int
    into v_hist_proofs
  from public.integration_automation_proofs
  where user_id=v_user;

  select count(*)::int, count(distinct pams_pin)::int
    into v_hist_verified_relationships, v_hist_verified_properties
  from public.integration_crm_property_links
  where user_id=v_user and status='verified';

  select count(*)::int, count(distinct pams_pin)::int,
         count(*) filter(where created_at <= now() - make_interval(days=>v_epoch.maturity_days))::int
    into v_cohort_findings, v_cohort_properties, v_mature_findings
  from public.intelligence_findings
  where user_id=v_user and created_at >= v_epoch.started_at
    and (v_epoch.ended_at is null or created_at < v_epoch.ended_at);

  select count(distinct p.finding_id)::int
    into v_proof_findings
  from public.integration_automation_proofs p
  join public.intelligence_findings f on f.id=p.finding_id and f.user_id=v_user
  where p.user_id=v_user and f.created_at >= v_epoch.started_at
    and (v_epoch.ended_at is null or f.created_at < v_epoch.ended_at);

  select count(*)::int into v_relationship_findings
  from public.intelligence_findings f
  where f.user_id=v_user and f.created_at >= v_epoch.started_at
    and (v_epoch.ended_at is null or f.created_at < v_epoch.ended_at)
    and exists(
      select 1 from public.integration_crm_property_links l
      where l.user_id=v_user and l.pams_pin=f.pams_pin and l.status='verified'
    );

  select count(*)::int, count(distinct finding_id)::int
    into v_t1_events, v_t1_findings
  from public.intelligence_outcome_events
  where user_id=v_user and occurred_at >= v_epoch.started_at
    and metadata->>'outcome_source'='user_reported';

  select count(*)::int,
         count(distinct finding_id) filter(where finding_id is not null)::int,
         count(*) filter(where state<>'finding_linked')::int
    into v_t2_events, v_t2_findings, v_t2_unlinked
  from public.integration_outcome_observations
  where user_id=v_user and observed_at >= v_epoch.started_at;

  select count(*)::int, count(distinct finding_id)::int
    into v_t3_events, v_t3_findings
  from public.intelligence_outcome_events
  where user_id=v_user and occurred_at >= v_epoch.started_at
    and metadata->>'outcome_source'='watchdog_verified';

  select
    count(*) filter(where exists(
      select 1 from public.intelligence_outcome_events e
      where e.user_id=v_user and e.finding_id=f.id and e.occurred_at>=v_epoch.started_at and e.metadata->>'outcome_source'='user_reported'
    ))::int,
    count(*) filter(where exists(
      select 1 from public.integration_outcome_observations o
      where o.user_id=v_user and o.finding_id=f.id and o.observed_at>=v_epoch.started_at and o.state='finding_linked'
    ))::int,
    count(*) filter(where exists(
      select 1 from public.intelligence_outcome_events e
      where e.user_id=v_user and e.finding_id=f.id and e.occurred_at>=v_epoch.started_at and e.metadata->>'outcome_source'='watchdog_verified'
    ))::int
    into v_mature_t1_findings, v_mature_t2_findings, v_mature_t3_findings
  from public.intelligence_findings f
  where f.user_id=v_user and f.created_at >= v_epoch.started_at
    and f.created_at <= now() - make_interval(days=>v_epoch.maturity_days)
    and (v_epoch.ended_at is null or f.created_at < v_epoch.ended_at);

  select count(*)::int into v_closed_t2
  from public.integration_outcome_observations
  where user_id=v_user and observed_at>=v_epoch.started_at
    and state='finding_linked' and mapped_outcome_type='closed';

  select
    count(*) filter(where state='pending_corroboration')::int,
    count(*) filter(where state='eligible')::int,
    count(*) filter(where state='conflicting_evidence')::int,
    count(*) filter(where state='rejected')::int,
    count(*) filter(where state='promoted')::int,
    count(*) filter(where state in ('pending_corroboration','eligible') and crm_occurred_at < now()-make_interval(days=>v_epoch.verification_window_days))::int
    into v_pending,v_eligible,v_conflicts,v_rejected,v_promoted,v_expired_unverified
  from public.integration_outcome_verification_candidates
  where user_id=v_user and crm_occurred_at>=v_epoch.started_at;

  v_settled := v_promoted + v_conflicts + v_rejected + v_expired_unverified;

  with first_outcomes as (
    select f.id as finding_id, f.created_at as finding_at, min(e.occurred_at) as outcome_at
    from public.intelligence_findings f
    join public.intelligence_outcome_events e on e.finding_id=f.id and e.user_id=v_user and e.occurred_at>=v_epoch.started_at
    where f.user_id=v_user and f.created_at>=v_epoch.started_at
    group by f.id,f.created_at
  ), hours as (
    select extract(epoch from (outcome_at-finding_at))/3600.0 as h from first_outcomes where outcome_at>=finding_at
  )
  select round(avg(h)::numeric,1), round(percentile_cont(0.5) within group(order by h)::numeric,1)
    into v_avg_finding_outcome_hours,v_p50_finding_outcome_hours
  from hours;

  with hours as (
    select extract(epoch from (matched_at-crm_occurred_at))/3600.0 as h
    from public.integration_outcome_verification_candidates
    where user_id=v_user and crm_occurred_at>=v_epoch.started_at and state='promoted'
      and matched_at is not null and matched_at>=crm_occurred_at
  )
  select round(avg(h)::numeric,1), round(percentile_cont(0.5) within group(order by h)::numeric,1)
    into v_avg_closed_verify_hours,v_p50_closed_verify_hours
  from hours;

  with base as (
    select f.id,f.opportunity_type,f.score,f.confidence,f.created_at,r.model_key,r.model_version,r.engine_version,
           (f.created_at <= now()-make_interval(days=>v_epoch.maturity_days)) as mature,
           exists(select 1 from public.integration_automation_proofs p where p.user_id=v_user and p.finding_id=f.id) as has_proof,
           exists(select 1 from public.integration_crm_property_links l where l.user_id=v_user and l.pams_pin=f.pams_pin and l.status='verified') as has_relationship,
           exists(select 1 from public.intelligence_outcome_events e where e.user_id=v_user and e.finding_id=f.id and e.occurred_at>=v_epoch.started_at and e.metadata->>'outcome_source'='user_reported') as has_t1,
           exists(select 1 from public.integration_outcome_observations o where o.user_id=v_user and o.finding_id=f.id and o.observed_at>=v_epoch.started_at and o.state='finding_linked') as has_t2,
           exists(select 1 from public.intelligence_outcome_events e where e.user_id=v_user and e.finding_id=f.id and e.occurred_at>=v_epoch.started_at and e.metadata->>'outcome_source'='watchdog_verified') as has_t3
    from public.intelligence_findings f
    join public.intelligence_runs r on r.id=f.run_id and r.user_id=v_user
    where f.user_id=v_user and f.created_at>=v_epoch.started_at
      and (v_epoch.ended_at is null or f.created_at<v_epoch.ended_at)
  ), grouped as (
    select opportunity_type as label,count(*)::int findings,count(*) filter(where mature)::int mature_findings,
           count(*) filter(where has_proof)::int proof_backed,count(*) filter(where has_relationship)::int relationship_ready,
           count(*) filter(where has_t1)::int tier1,count(*) filter(where has_t2)::int tier2,count(*) filter(where has_t3)::int tier3,
           count(*) filter(where mature and has_t2)::int mature_tier2,count(*) filter(where mature and has_t3)::int mature_tier3,
           round(avg(score)::numeric,1) avg_score,round(avg(confidence)::numeric,1) avg_confidence
    from base group by opportunity_type
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'label',label,'findings',findings,'mature_findings',mature_findings,'proof_backed',proof_backed,'relationship_ready',relationship_ready,
    'tier1',tier1,'tier2',tier2,'tier3',tier3,'avg_score',avg_score,'avg_confidence',avg_confidence,
    'system_observed_rate_pct',case when mature_findings>0 then round(100.0*mature_tier2/mature_findings,1) else null end,
    'verified_rate_pct',case when mature_findings>0 then round(100.0*mature_tier3/mature_findings,1) else null end,
    'sample_state',case when mature_findings=0 then 'no_sample' when mature_findings<10 then 'learning' when mature_findings<30 then 'early_signal' when mature_findings<100 then 'calibrating' else 'evidence_base' end
  ) order by findings desc),'[]'::jsonb) into v_opportunity from grouped;

  with base as (
    select f.id,
      case when f.score is null then 'Unknown' when f.score<40 then '0–39' when f.score<60 then '40–59' when f.score<80 then '60–79' else '80–100' end as band,
      case when f.score is null then 5 when f.score<40 then 1 when f.score<60 then 2 when f.score<80 then 3 else 4 end as ord,
      (f.created_at <= now()-make_interval(days=>v_epoch.maturity_days)) as mature,
      exists(select 1 from public.integration_outcome_observations o where o.user_id=v_user and o.finding_id=f.id and o.observed_at>=v_epoch.started_at and o.state='finding_linked') as has_t2,
      exists(select 1 from public.intelligence_outcome_events e where e.user_id=v_user and e.finding_id=f.id and e.occurred_at>=v_epoch.started_at and e.metadata->>'outcome_source'='watchdog_verified') as has_t3
    from public.intelligence_findings f where f.user_id=v_user and f.created_at>=v_epoch.started_at
      and (v_epoch.ended_at is null or f.created_at<v_epoch.ended_at)
  ), grouped as (
    select band,ord,count(*)::int findings,count(*) filter(where mature)::int mature_findings,
           count(*) filter(where has_t2)::int tier2,count(*) filter(where has_t3)::int tier3,
           count(*) filter(where mature and has_t2)::int mature_tier2,count(*) filter(where mature and has_t3)::int mature_tier3
    from base group by band,ord
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'label',band,'findings',findings,'mature_findings',mature_findings,'tier2',tier2,'tier3',tier3,
    'system_observed_rate_pct',case when mature_findings>0 then round(100.0*mature_tier2/mature_findings,1) else null end,
    'verified_rate_pct',case when mature_findings>0 then round(100.0*mature_tier3/mature_findings,1) else null end,
    'sample_state',case when mature_findings=0 then 'no_sample' when mature_findings<10 then 'learning' when mature_findings<30 then 'early_signal' when mature_findings<100 then 'calibrating' else 'evidence_base' end
  ) order by ord),'[]'::jsonb) into v_score from grouped;

  with base as (
    select f.id,
      case when f.confidence is null then 'Unknown' when f.confidence<40 then '0–39' when f.confidence<60 then '40–59' when f.confidence<80 then '60–79' else '80–100' end as band,
      case when f.confidence is null then 5 when f.confidence<40 then 1 when f.confidence<60 then 2 when f.confidence<80 then 3 else 4 end as ord,
      (f.created_at <= now()-make_interval(days=>v_epoch.maturity_days)) as mature,
      exists(select 1 from public.integration_outcome_observations o where o.user_id=v_user and o.finding_id=f.id and o.observed_at>=v_epoch.started_at and o.state='finding_linked') as has_t2,
      exists(select 1 from public.intelligence_outcome_events e where e.user_id=v_user and e.finding_id=f.id and e.occurred_at>=v_epoch.started_at and e.metadata->>'outcome_source'='watchdog_verified') as has_t3
    from public.intelligence_findings f where f.user_id=v_user and f.created_at>=v_epoch.started_at
      and (v_epoch.ended_at is null or f.created_at<v_epoch.ended_at)
  ), grouped as (
    select band,ord,count(*)::int findings,count(*) filter(where mature)::int mature_findings,
           count(*) filter(where has_t2)::int tier2,count(*) filter(where has_t3)::int tier3,
           count(*) filter(where mature and has_t2)::int mature_tier2,count(*) filter(where mature and has_t3)::int mature_tier3
    from base group by band,ord
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'label',band,'findings',findings,'mature_findings',mature_findings,'tier2',tier2,'tier3',tier3,
    'system_observed_rate_pct',case when mature_findings>0 then round(100.0*mature_tier2/mature_findings,1) else null end,
    'verified_rate_pct',case when mature_findings>0 then round(100.0*mature_tier3/mature_findings,1) else null end,
    'sample_state',case when mature_findings=0 then 'no_sample' when mature_findings<10 then 'learning' when mature_findings<30 then 'early_signal' when mature_findings<100 then 'calibrating' else 'evidence_base' end
  ) order by ord),'[]'::jsonb) into v_confidence from grouped;

  with base as (
    select f.id,r.model_key,r.model_version,r.engine_version,f.score,f.confidence,
      (f.created_at <= now()-make_interval(days=>v_epoch.maturity_days)) as mature,
      exists(select 1 from public.integration_outcome_observations o where o.user_id=v_user and o.finding_id=f.id and o.observed_at>=v_epoch.started_at and o.state='finding_linked') as has_t2,
      exists(select 1 from public.intelligence_outcome_events e where e.user_id=v_user and e.finding_id=f.id and e.occurred_at>=v_epoch.started_at and e.metadata->>'outcome_source'='watchdog_verified') as has_t3
    from public.intelligence_findings f join public.intelligence_runs r on r.id=f.run_id and r.user_id=v_user
    where f.user_id=v_user and f.created_at>=v_epoch.started_at
      and (v_epoch.ended_at is null or f.created_at<v_epoch.ended_at)
  ), grouped as (
    select model_key,model_version,engine_version,count(*)::int findings,count(*) filter(where mature)::int mature_findings,
           count(*) filter(where has_t2)::int tier2,count(*) filter(where has_t3)::int tier3,
           count(*) filter(where mature and has_t2)::int mature_tier2,count(*) filter(where mature and has_t3)::int mature_tier3,
           round(avg(score)::numeric,1) avg_score,round(avg(confidence)::numeric,1) avg_confidence
    from base group by model_key,model_version,engine_version
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'model_key',model_key,'model_version',model_version,'engine_version',engine_version,'findings',findings,'mature_findings',mature_findings,
    'tier2',tier2,'tier3',tier3,'avg_score',avg_score,'avg_confidence',avg_confidence,
    'system_observed_rate_pct',case when mature_findings>0 then round(100.0*mature_tier2/mature_findings,1) else null end,
    'verified_rate_pct',case when mature_findings>0 then round(100.0*mature_tier3/mature_findings,1) else null end,
    'sample_state',case when mature_findings=0 then 'no_sample' when mature_findings<10 then 'learning' when mature_findings<30 then 'early_signal' when mature_findings<100 then 'calibrating' else 'evidence_base' end
  ) order by findings desc),'[]'::jsonb) into v_models from grouped;

  with events as (
    select event_type as outcome_type,'tier_1'::text as source,count(*)::int n
    from public.intelligence_outcome_events where user_id=v_user and occurred_at>=v_epoch.started_at and metadata->>'outcome_source'='user_reported' group by event_type
    union all
    select mapped_outcome_type,'tier_2',count(*)::int
    from public.integration_outcome_observations where user_id=v_user and observed_at>=v_epoch.started_at group by mapped_outcome_type
    union all
    select event_type,'tier_3',count(*)::int
    from public.intelligence_outcome_events where user_id=v_user and occurred_at>=v_epoch.started_at and metadata->>'outcome_source'='watchdog_verified' group by event_type
  )
  select coalesce(jsonb_agg(jsonb_build_object('outcome_type',outcome_type,'trust_tier',source,'count',n) order by outcome_type,source),'[]'::jsonb)
    into v_outcome_types from events;

  with reasons as (
    select reason, count(*)::int n
    from public.integration_outcome_verification_candidates c
    cross join lateral unnest(coalesce(c.reason_codes,array[]::text[])) reason
    where c.user_id=v_user and c.crm_occurred_at>=v_epoch.started_at
    group by reason order by n desc,reason limit 12
  )
  select coalesce(jsonb_agg(jsonb_build_object('reason_code',reason,'count',n) order by n desc,reason),'[]'::jsonb)
    into v_reason_codes from reasons;

  v_stage := case
    when v_mature_findings=0 then 'no_sample'
    when v_mature_findings<10 then 'learning'
    when v_mature_findings<30 then 'early_signal'
    when v_mature_findings<100 then 'calibrating'
    else 'evidence_base'
  end;

  return jsonb_build_object(
    'measurement',jsonb_build_object(
      'epoch_key',v_epoch.epoch_key,'started_at',v_epoch.started_at,'maturity_days',v_epoch.maturity_days,
      'verification_window_days',v_epoch.verification_window_days,'tier2_contract',v_epoch.tier2_contract,
      'tier3_rule_version',v_epoch.tier3_rule_version,'sample_state',v_stage,
      'next_maturity_at',v_epoch.started_at+make_interval(days=>v_epoch.maturity_days),
      'rate_policy','Rates remain null until an eligible denominator has matured. Open verification windows are not counted as failures.'
    ),
    'historical_baseline',jsonb_build_object(
      'findings',v_hist_findings,'properties',v_hist_properties,'proof_backed_findings',v_hist_proofs,
      'verified_relationships',v_hist_verified_relationships,'verified_relationship_properties',v_hist_verified_properties,
      'excluded_from_rate_denominator',true
    ),
    'funnel',jsonb_build_object(
      'cohort_findings',v_cohort_findings,'cohort_properties',v_cohort_properties,'mature_findings',v_mature_findings,
      'proof_backed_findings',v_proof_findings,'relationship_ready_findings',v_relationship_findings,
      'tier1_events',v_t1_events,'tier1_findings',v_t1_findings,
      'tier2_events',v_t2_events,'tier2_findings',v_t2_findings,'tier2_unlinked_events',v_t2_unlinked,
      'tier3_events',v_t3_events,'tier3_findings',v_t3_findings,
      'mature_tier1_findings',v_mature_t1_findings,'mature_tier2_findings',v_mature_t2_findings,'mature_tier3_findings',v_mature_t3_findings,
      'attested_rate_pct',case when v_mature_findings>0 then round(100.0*v_mature_t1_findings/v_mature_findings,1) else null end,
      'system_observed_rate_pct',case when v_mature_findings>0 then round(100.0*v_mature_t2_findings/v_mature_findings,1) else null end,
      'watchdog_verified_rate_pct',case when v_mature_findings>0 then round(100.0*v_mature_t3_findings/v_mature_findings,1) else null end
    ),
    'verification',jsonb_build_object(
      'tier2_closed_finding_linked',v_closed_t2,'pending_corroboration',v_pending,'eligible',v_eligible,
      'conflicting_evidence',v_conflicts,'rejected',v_rejected,'promoted',v_promoted,
      'expired_unverified',v_expired_unverified,'settled_denominator',v_settled,
      'settled_verified_rate_pct',case when v_settled>0 then round(100.0*v_promoted/v_settled,1) else null end,
      'open_windows_are_failures',false
    ),
    'latency',jsonb_build_object(
      'finding_to_first_outcome_avg_hours',v_avg_finding_outcome_hours,
      'finding_to_first_outcome_p50_hours',v_p50_finding_outcome_hours,
      'tier2_closed_to_authoritative_corroboration_avg_hours',v_avg_closed_verify_hours,
      'tier2_closed_to_authoritative_corroboration_p50_hours',v_p50_closed_verify_hours
    ),
    'cohorts',jsonb_build_object('opportunity',v_opportunity,'score',v_score,'confidence',v_confidence,'model',v_models),
    'outcome_types',v_outcome_types,
    'verification_reason_codes',v_reason_codes,
    'guardrails',jsonb_build_object(
      'causal_attribution',false,'execution_allowed',false,'property_fact_authority_for_business_outcome',false,
      'tier3_corroborating_property_fact_authority',true,
      'interpretation','Observed and verified outcomes are measurement evidence. They do not prove Watchdog caused the result or authorize automation.'
    )
  );
end;
$$;

revoke all on function public.integration_outcome_intelligence_dashboard() from public, anon;
grant execute on function public.integration_outcome_intelligence_dashboard() to authenticated;
