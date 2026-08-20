create or replace function public.integration_policy_feedback_readiness()
returns jsonb
language plpgsql
security definer
set search_path='public','private','pg_temp'
as $$
declare
  v_user uuid:=auth.uid();
  v_epoch public.integration_outcome_measurement_epochs%rowtype;
  v_policies jsonb:='[]'::jsonb;
  v_total int:=0;
  v_ready int:=0;
  v_learning int:=0;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if not public.integration_automation_entitled() then raise exception 'Policy feedback requires Pro+ or Teams' using errcode='42501'; end if;

  select * into v_epoch
  from public.integration_outcome_measurement_epochs
  where started_at<=now() and (ended_at is null or ended_at>now())
  order by started_at desc limit 1;
  if not found then raise exception 'No active outcome measurement epoch' using errcode='P0002'; end if;

  with policies as (
    select p.*,
      not exists(
        select 1 from jsonb_object_keys(coalesce(p.conditions,'{}'::jsonb)) k
        where k not in ('min_score','min_confidence','min_materiality','min_evidence_coverage','require_verified_relationship')
      ) as supported
    from public.integration_automation_policies p
    where p.user_id=v_user and p.status='shadow' and p.trigger_event_type='intelligence.finding.created'
      and not exists(
        select 1 from public.integration_policy_recommendation_reviews rr
        where rr.user_id=v_user and rr.shadow_policy_id=p.id
      )
  ), evaluated as (
    select p.id,p.policy_group_id,p.name,p.version,p.status,p.conditions,p.action_plan,p.autonomy_tier,p.required_approval,p.supported,
      count(f.id)::int as cohort_findings,
      count(f.id) filter(where f.created_at<=now()-make_interval(days=>v_epoch.maturity_days))::int as mature_findings,
      count(f.id) filter(where f.created_at<=now()-make_interval(days=>v_epoch.maturity_days) and exists(
        select 1 from public.integration_outcome_observations o where o.user_id=v_user and o.finding_id=f.id and o.state='finding_linked' and o.observed_at>=v_epoch.started_at
      ))::int as mature_tier2,
      count(f.id) filter(where f.created_at<=now()-make_interval(days=>v_epoch.maturity_days) and exists(
        select 1 from public.intelligence_outcome_events e where e.user_id=v_user and e.finding_id=f.id and e.metadata->>'outcome_source'='watchdog_verified' and e.occurred_at>=v_epoch.started_at
      ))::int as mature_tier3
    from policies p
    left join public.intelligence_findings f on f.user_id=v_user
      and f.created_at>=v_epoch.started_at
      and (v_epoch.ended_at is null or f.created_at<v_epoch.ended_at)
      and ((p.conditions->>'min_score') is null or f.score>=((p.conditions->>'min_score')::numeric))
      and ((p.conditions->>'min_confidence') is null or f.confidence>=((p.conditions->>'min_confidence')::numeric))
      and ((p.conditions->>'min_evidence_coverage') is null or f.evidence_coverage>=((p.conditions->>'min_evidence_coverage')::numeric))
      and ((p.conditions->>'min_materiality') is null or (coalesce(f.score,0)*coalesce(f.confidence,0)*coalesce(f.evidence_coverage,0)/10000.0)>=((p.conditions->>'min_materiality')::numeric))
      and (coalesce((p.conditions->>'require_verified_relationship')::boolean,false)=false or exists(
        select 1 from public.integration_crm_property_links l where l.user_id=v_user and l.pams_pin=f.pams_pin and l.status='verified'
      ))
    group by p.id,p.policy_group_id,p.name,p.version,p.status,p.conditions,p.action_plan,p.autonomy_tier,p.required_approval,p.supported
  ), shaped as (
    select e.*,
      case
        when not supported then 'unsupported_conditions'
        when mature_findings=0 then 'no_sample'
        when mature_findings<10 then 'learning'
        when mature_findings<30 then 'early_signal'
        when mature_findings<100 then 'review_ready'
        else 'evidence_base'
      end as feedback_state,
      case when mature_findings>0 then round(100.0*mature_tier2/mature_findings,1) else null end as tier2_rate,
      case when mature_findings>0 then round(100.0*mature_tier3/mature_findings,1) else null end as tier3_rate
    from evaluated e
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'policy_id',id,'policy_group_id',policy_group_id,'name',name,'version',version,'status',status,
    'conditions',conditions,'action_plan',action_plan,'autonomy_tier',autonomy_tier,'required_approval',required_approval,
    'conditions_supported',supported,'cohort_findings',cohort_findings,'mature_findings',mature_findings,
    'mature_tier2_findings',mature_tier2,'mature_tier3_findings',mature_tier3,
    'system_observed_rate_pct',tier2_rate,'watchdog_verified_rate_pct',tier3_rate,'feedback_state',feedback_state,
    'minimum_review_sample',30,
    'mature_findings_needed',greatest(0,30-mature_findings),
    'recommendation',case
      when feedback_state='unsupported_conditions' then 'This policy uses evidence conditions that the v1 outcome feedback evaluator does not simplify. Keep it in shadow and review it in Advanced.'
      when feedback_state in ('no_sample','learning','early_signal') then 'Keep the current policy unchanged while measured outcomes mature.'
      else 'Evidence is sufficient for a counterfactual shadow review. Do not change the live policy from this signal alone.' end,
    'counterfactual_candidates',case
      when feedback_state in ('review_ready','evidence_base') and conditions ? 'min_score' then jsonb_build_array(
        jsonb_build_object('label','broader_shadow_test','conditions_patch',jsonb_build_object('min_score',greatest(0,((conditions->>'min_score')::numeric)-5))),
        jsonb_build_object('label','current_policy','conditions_patch',jsonb_build_object('min_score',(conditions->>'min_score')::numeric)),
        jsonb_build_object('label','stricter_shadow_test','conditions_patch',jsonb_build_object('min_score',least(100,((conditions->>'min_score')::numeric)+5)))
      ) else '[]'::jsonb end
  ) order by name,version desc),'[]'::jsonb),
  count(*)::int,
  count(*) filter(where feedback_state in ('review_ready','evidence_base'))::int,
  count(*) filter(where feedback_state in ('no_sample','learning','early_signal'))::int
  into v_policies,v_total,v_ready,v_learning
  from shaped;

  return jsonb_build_object(
    'measurement',jsonb_build_object(
      'epoch_key',v_epoch.epoch_key,'started_at',v_epoch.started_at,'maturity_days',v_epoch.maturity_days,
      'minimum_review_sample',30,'recommendation_contract','outcome-policy-feedback-v1'
    ),
    'summary',jsonb_build_object(
      'shadow_policies',v_total,'review_ready',v_ready,'learning',v_learning,
      'state',case when v_total=0 then 'no_policies' when v_ready>0 then 'review_ready' else 'learning' end,
      'headline',case when v_total=0 then 'No shadow policies to calibrate' when v_ready=1 then '1 policy ready for counterfactual review' when v_ready>1 then v_ready||' policies ready for counterfactual review' else 'Watchdog is still learning from measured outcomes' end
    ),
    'policies',v_policies,
    'guardrails',jsonb_build_object(
      'policy_mutation_allowed',false,'execution_allowed',false,'causal_attribution',false,
      'counterfactual_only',true,'human_review_required',true,
      'experiment_versions_excluded',true,
      'interpretation','Outcome evidence can recommend a shadow comparison. It cannot silently change a policy, increase autonomy or authorize external execution.'
    )
  );
end;
$$;

revoke all on function public.integration_policy_feedback_readiness() from public,anon;
grant execute on function public.integration_policy_feedback_readiness() to authenticated;
