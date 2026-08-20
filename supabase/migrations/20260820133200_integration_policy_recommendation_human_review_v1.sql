create table if not exists public.integration_policy_recommendation_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  policy_id uuid not null references public.integration_automation_policies(id) on delete cascade,
  policy_group_id uuid not null,
  source_policy_version integer not null check (source_policy_version > 0),
  recommendation_key text not null check (char_length(recommendation_key) between 8 and 80),
  candidate_label text not null check (char_length(candidate_label) between 1 and 100),
  decision text not null check (decision in ('accepted_for_shadow','rejected')),
  conditions_before jsonb not null default '{}'::jsonb check (jsonb_typeof(conditions_before)='object'),
  conditions_patch jsonb not null default '{}'::jsonb check (jsonb_typeof(conditions_patch)='object'),
  conditions_after jsonb not null default '{}'::jsonb check (jsonb_typeof(conditions_after)='object'),
  evidence_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_snapshot)='object'),
  shadow_policy_id uuid references public.integration_automation_policies(id) on delete set null,
  shadow_run_id uuid references public.integration_shadow_runs(id) on delete set null,
  window_days integer check (window_days between 1 and 90),
  review_note text check (review_note is null or char_length(review_note) <= 1000),
  created_at timestamptz not null default now(),
  unique(user_id,recommendation_key)
);

alter table public.integration_policy_recommendation_reviews enable row level security;
revoke all on table public.integration_policy_recommendation_reviews from public,anon,authenticated;

create index if not exists integration_policy_recommendation_reviews_user_created_idx
  on public.integration_policy_recommendation_reviews(user_id,created_at desc);
create index if not exists integration_policy_recommendation_reviews_policy_idx
  on public.integration_policy_recommendation_reviews(policy_id,created_at desc);
create index if not exists integration_policy_recommendation_reviews_shadow_policy_idx
  on public.integration_policy_recommendation_reviews(shadow_policy_id) where shadow_policy_id is not null;
create index if not exists integration_policy_recommendation_reviews_shadow_run_idx
  on public.integration_policy_recommendation_reviews(shadow_run_id) where shadow_run_id is not null;

create or replace function public.integration_policy_feedback_review_queue()
returns jsonb
language plpgsql
security definer
set search_path='public','private','pg_temp'
as $$
declare
  v_user uuid:=auth.uid();
  v_feedback jsonb;
  v_measurement jsonb;
  v_policy jsonb;
  v_candidate jsonb;
  v_policies jsonb:='[]'::jsonb;
  v_candidates jsonb;
  v_mix jsonb;
  v_snapshot jsonb;
  v_key text;
  v_review public.integration_policy_recommendation_reviews%rowtype;
  v_conditions jsonb;
  v_started_at timestamptz;
  v_maturity_days integer;
  v_actionable integer:=0;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if not public.integration_automation_entitled() then raise exception 'Policy feedback requires Pro+ or Teams' using errcode='42501'; end if;

  v_feedback:=public.integration_policy_feedback_readiness();
  v_measurement:=coalesce(v_feedback->'measurement','{}'::jsonb);
  v_started_at:=(v_measurement->>'started_at')::timestamptz;
  v_maturity_days:=coalesce((v_measurement->>'maturity_days')::integer,30);

  for v_policy in select value from jsonb_array_elements(coalesce(v_feedback->'policies','[]'::jsonb)) loop
    v_conditions:=coalesce(v_policy->'conditions','{}'::jsonb);

    select coalesce(jsonb_agg(jsonb_build_object(
      'model_key',q.model_key,'model_version',q.model_version,'findings',q.cnt
    ) order by q.cnt desc,q.model_key,q.model_version),'[]'::jsonb)
    into v_mix
    from (
      select r.model_key,r.model_version,count(*)::int cnt
      from public.intelligence_findings f
      join public.intelligence_runs r on r.id=f.run_id and r.user_id=v_user
      where f.user_id=v_user
        and f.created_at>=v_started_at
        and f.created_at<=now()-make_interval(days=>v_maturity_days)
        and ((v_conditions->>'min_score') is null or f.score>=((v_conditions->>'min_score')::numeric))
        and ((v_conditions->>'min_confidence') is null or f.confidence>=((v_conditions->>'min_confidence')::numeric))
        and ((v_conditions->>'min_evidence_coverage') is null or f.evidence_coverage>=((v_conditions->>'min_evidence_coverage')::numeric))
        and ((v_conditions->>'min_materiality') is null or (coalesce(f.score,0)*coalesce(f.confidence,0)*coalesce(f.evidence_coverage,0)/10000.0)>=((v_conditions->>'min_materiality')::numeric))
        and (coalesce((v_conditions->>'require_verified_relationship')::boolean,false)=false or exists(
          select 1 from public.integration_crm_property_links l
          where l.user_id=v_user and l.pams_pin=f.pams_pin and l.status='verified'
        ))
      group by r.model_key,r.model_version
    ) q;

    v_candidates:='[]'::jsonb;
    for v_candidate in select value from jsonb_array_elements(coalesce(v_policy->'counterfactual_candidates','[]'::jsonb)) loop
      v_snapshot:=jsonb_build_object(
        'recommendation_contract','outcome-policy-human-review-v1',
        'epoch_key',v_measurement->>'epoch_key',
        'epoch_started_at',v_measurement->>'started_at',
        'maturity_days',v_maturity_days,
        'policy_id',v_policy->>'policy_id',
        'policy_group_id',v_policy->>'policy_group_id',
        'policy_version',(v_policy->>'version')::integer,
        'feedback_state',v_policy->>'feedback_state',
        'cohort_findings',(v_policy->>'cohort_findings')::integer,
        'mature_findings',(v_policy->>'mature_findings')::integer,
        'mature_tier2_findings',(v_policy->>'mature_tier2_findings')::integer,
        'mature_tier3_findings',(v_policy->>'mature_tier3_findings')::integer,
        'system_observed_rate_pct',v_policy->'system_observed_rate_pct',
        'watchdog_verified_rate_pct',v_policy->'watchdog_verified_rate_pct',
        'model_version_mix',coalesce(v_mix,'[]'::jsonb),
        'conditions_before',v_conditions,
        'candidate_label',v_candidate->>'label',
        'conditions_patch',coalesce(v_candidate->'conditions_patch','{}'::jsonb),
        'causal_attribution',false,
        'execution_allowed',false
      );
      v_key:='rec_'||substr(md5(v_snapshot::text),1,24);
      select * into v_review
      from public.integration_policy_recommendation_reviews r
      where r.user_id=v_user and r.recommendation_key=v_key
      limit 1;

      if coalesce(v_candidate->>'label','')<>'current_policy' then v_actionable:=v_actionable+1; end if;
      v_candidates:=v_candidates||jsonb_build_array(
        v_candidate||jsonb_build_object(
          'recommendation_key',v_key,
          'selectable',coalesce(v_candidate->>'label','')<>'current_policy',
          'evidence_snapshot',v_snapshot,
          'review_status',case when found then v_review.decision else null end,
          'reviewed_at',case when found then v_review.created_at else null end,
          'shadow_policy_id',case when found then v_review.shadow_policy_id else null end,
          'shadow_run_id',case when found then v_review.shadow_run_id else null end
        )
      );
    end loop;

    v_policies:=v_policies||jsonb_build_array(
      (v_policy-'counterfactual_candidates')||jsonb_build_object(
        'model_version_mix',coalesce(v_mix,'[]'::jsonb),
        'counterfactual_candidates',v_candidates
      )
    );
  end loop;

  return jsonb_set(
    jsonb_set(
      jsonb_set(v_feedback,'{policies}',v_policies,true),
      '{measurement,review_contract}',
      to_jsonb('outcome-policy-human-review-v1'::text),true
    ),
    '{summary,actionable_recommendations}',
    to_jsonb(v_actionable),true
  )||jsonb_build_object('review_guardrails',jsonb_build_object(
    'explicit_human_review',true,
    'stale_recommendations_rejected',true,
    'creates_shadow_policy_only',true,
    'policy_mutation_allowed',false,
    'execution_allowed',false,
    'causal_attribution',false
  ));
end;
$$;

create or replace function public.integration_review_policy_recommendation(
  p_policy_id uuid,
  p_recommendation_key text,
  p_decision text,
  p_window_days integer default 30,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path='public','private','pg_temp'
as $$
declare
  v_user uuid:=auth.uid();
  v_queue jsonb;
  v_policy jsonb;
  v_candidate jsonb;
  v_source public.integration_automation_policies%rowtype;
  v_existing public.integration_policy_recommendation_reviews%rowtype;
  v_review_id uuid;
  v_before jsonb;
  v_patch jsonb;
  v_after jsonb;
  v_snapshot jsonb;
  v_saved jsonb;
  v_run jsonb;
  v_shadow_policy uuid;
  v_shadow_run uuid;
  v_days integer:=greatest(1,least(coalesce(p_window_days,30),90));
  v_label text;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if not public.integration_automation_entitled() then raise exception 'Policy recommendation review requires Pro+ or Teams' using errcode='42501'; end if;
  if p_decision not in ('accepted_for_shadow','rejected') then raise exception 'Decision must be accepted_for_shadow or rejected' using errcode='23514'; end if;
  if nullif(trim(coalesce(p_recommendation_key,'')),'') is null then raise exception 'Recommendation key is required' using errcode='23514'; end if;
  if p_note is not null and char_length(p_note)>1000 then raise exception 'Review note is too long' using errcode='23514'; end if;

  select * into v_existing
  from public.integration_policy_recommendation_reviews r
  where r.user_id=v_user and r.recommendation_key=p_recommendation_key
  limit 1;
  if found then
    if v_existing.decision<>p_decision then raise exception 'This recommendation was already reviewed with a different decision' using errcode='23514'; end if;
    return jsonb_build_object(
      'review_id',v_existing.id,'decision',v_existing.decision,'recommendation_key',v_existing.recommendation_key,
      'shadow_policy_id',v_existing.shadow_policy_id,'shadow_run_id',v_existing.shadow_run_id,
      'idempotent',true,'execution_allowed',false
    );
  end if;

  v_queue:=public.integration_policy_feedback_review_queue();
  select value into v_policy
  from jsonb_array_elements(coalesce(v_queue->'policies','[]'::jsonb))
  where value->>'policy_id'=p_policy_id::text
  limit 1;
  if v_policy is null then raise exception 'Policy is not eligible for outcome feedback' using errcode='P0002'; end if;
  if coalesce(v_policy->>'feedback_state','') not in ('review_ready','evidence_base') then raise exception 'Measured outcome evidence is not mature enough for human review' using errcode='23514'; end if;

  select value into v_candidate
  from jsonb_array_elements(coalesce(v_policy->'counterfactual_candidates','[]'::jsonb))
  where value->>'recommendation_key'=p_recommendation_key
  limit 1;
  if v_candidate is null then raise exception 'Recommendation changed or is stale. Refresh policy feedback before reviewing.' using errcode='23514'; end if;
  if coalesce((v_candidate->>'selectable')::boolean,false)=false then raise exception 'The current-policy baseline is not an actionable recommendation' using errcode='23514'; end if;

  v_label:=v_candidate->>'label';
  v_before:=coalesce(v_policy->'conditions','{}'::jsonb);
  v_patch:=coalesce(v_candidate->'conditions_patch','{}'::jsonb);
  v_after:=v_before||v_patch;
  v_snapshot:=coalesce(v_candidate->'evidence_snapshot','{}'::jsonb);
  if v_after=v_before then raise exception 'Recommendation does not change the shadow conditions' using errcode='23514'; end if;

  select * into v_source
  from public.integration_automation_policies p
  where p.id=p_policy_id and p.user_id=v_user and p.status='shadow'
  limit 1;
  if not found then raise exception 'Source shadow policy not found' using errcode='P0002'; end if;
  if v_source.version<>(v_policy->>'version')::integer or v_source.conditions<>v_before then
    raise exception 'Source policy changed. Refresh policy feedback before reviewing.' using errcode='23514';
  end if;

  insert into public.integration_policy_recommendation_reviews(
    user_id,policy_id,policy_group_id,source_policy_version,recommendation_key,candidate_label,decision,
    conditions_before,conditions_patch,conditions_after,evidence_snapshot,window_days,review_note
  ) values(
    v_user,v_source.id,v_source.policy_group_id,v_source.version,p_recommendation_key,left(v_label,100),p_decision,
    v_before,v_patch,v_after,v_snapshot,v_days,nullif(trim(coalesce(p_note,'')),'')
  ) returning id into v_review_id;

  if p_decision='rejected' then
    insert into public.integration_audit_log(user_id,connection_id,action,actor,details)
    values(v_user,null,'automation.policy.recommendation.rejected','user',jsonb_build_object(
      'review_id',v_review_id,'recommendation_key',p_recommendation_key,'policy_id',v_source.id,
      'policy_version',v_source.version,'candidate_label',v_label,'conditions_before',v_before,'conditions_patch',v_patch,
      'execution_allowed',false,'causal_attribution',false
    ));
    return jsonb_build_object('review_id',v_review_id,'decision','rejected','recommendation_key',p_recommendation_key,'execution_allowed',false);
  end if;

  v_saved:=public.integration_save_shadow_policy(
    left(v_source.name||' · '||replace(v_label,'_',' '),120),
    v_source.trigger_event_type,
    v_after,
    v_source.action_plan,
    v_source.policy_group_id,
    'shadow',
    0,
    'human'
  );
  v_shadow_policy:=(v_saved->>'id')::uuid;
  v_run:=public.integration_run_shadow_policy(v_shadow_policy,v_days);
  v_shadow_run:=(v_run->>'shadow_run_id')::uuid;

  update public.integration_policy_recommendation_reviews
  set shadow_policy_id=v_shadow_policy,shadow_run_id=v_shadow_run
  where id=v_review_id;

  insert into public.integration_audit_log(user_id,connection_id,action,actor,details)
  values(v_user,null,'automation.policy.recommendation.accepted_for_shadow','user',jsonb_build_object(
    'review_id',v_review_id,'recommendation_key',p_recommendation_key,'source_policy_id',v_source.id,
    'source_policy_version',v_source.version,'shadow_policy_id',v_shadow_policy,'shadow_run_id',v_shadow_run,
    'candidate_label',v_label,'conditions_before',v_before,'conditions_patch',v_patch,'conditions_after',v_after,
    'window_days',v_days,'autonomy_tier',0,'required_approval','human','external_writes',0,
    'execution_allowed',false,'causal_attribution',false
  ));

  return jsonb_build_object(
    'review_id',v_review_id,'decision','accepted_for_shadow','recommendation_key',p_recommendation_key,
    'source_policy_id',v_source.id,'shadow_policy_id',v_shadow_policy,'shadow_run_id',v_shadow_run,
    'shadow_run',v_run,'policy_mutation_allowed',false,'execution_allowed',false,'causal_attribution',false,
    'message','Recommendation accepted for a human-reviewed counterfactual shadow test. No external action was executed.'
  );
end;
$$;

create or replace function public.integration_list_policy_recommendation_reviews(p_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path='public','private','pg_temp'
as $$
declare
  v_user uuid:=auth.uid();
  v_limit integer:=greatest(1,least(coalesce(p_limit,20),100));
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if not public.integration_automation_entitled() then raise exception 'Policy recommendation history requires Pro+ or Teams' using errcode='42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',r.id,'policy_id',r.policy_id,'policy_group_id',r.policy_group_id,'source_policy_version',r.source_policy_version,
      'recommendation_key',r.recommendation_key,'candidate_label',r.candidate_label,'decision',r.decision,
      'conditions_before',r.conditions_before,'conditions_patch',r.conditions_patch,'conditions_after',r.conditions_after,
      'evidence_snapshot',r.evidence_snapshot,'shadow_policy_id',r.shadow_policy_id,'shadow_run_id',r.shadow_run_id,
      'window_days',r.window_days,'review_note',r.review_note,'created_at',r.created_at
    ) order by r.created_at desc)
    from (
      select * from public.integration_policy_recommendation_reviews
      where user_id=v_user order by created_at desc limit v_limit
    ) r
  ),'[]'::jsonb);
end;
$$;

revoke all on function public.integration_policy_feedback_review_queue() from public,anon;
grant execute on function public.integration_policy_feedback_review_queue() to authenticated;
revoke all on function public.integration_review_policy_recommendation(uuid,text,text,integer,text) from public,anon;
grant execute on function public.integration_review_policy_recommendation(uuid,text,text,integer,text) to authenticated;
revoke all on function public.integration_list_policy_recommendation_reviews(integer) from public,anon;
grant execute on function public.integration_list_policy_recommendation_reviews(integer) to authenticated;
