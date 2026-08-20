alter table public.integration_policy_recommendation_reviews
  add column if not exists baseline_shadow_run_id uuid references public.integration_shadow_runs(id) on delete set null;

create index if not exists integration_policy_recommendation_reviews_baseline_run_idx
  on public.integration_policy_recommendation_reviews(baseline_shadow_run_id)
  where baseline_shadow_run_id is not null;

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
  v_baseline_run jsonb;
  v_run jsonb;
  v_shadow_policy uuid;
  v_baseline_shadow_run uuid;
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
      'shadow_policy_id',v_existing.shadow_policy_id,'baseline_shadow_run_id',v_existing.baseline_shadow_run_id,
      'shadow_run_id',v_existing.shadow_run_id,'idempotent',true,'execution_allowed',false
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

  v_baseline_run:=public.integration_run_shadow_policy(v_source.id,v_days);
  v_baseline_shadow_run:=(v_baseline_run->>'shadow_run_id')::uuid;

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
  set baseline_shadow_run_id=v_baseline_shadow_run,shadow_policy_id=v_shadow_policy,shadow_run_id=v_shadow_run
  where id=v_review_id;

  insert into public.integration_audit_log(user_id,connection_id,action,actor,details)
  values(v_user,null,'automation.policy.recommendation.accepted_for_shadow','user',jsonb_build_object(
    'review_id',v_review_id,'recommendation_key',p_recommendation_key,'source_policy_id',v_source.id,
    'source_policy_version',v_source.version,'baseline_shadow_run_id',v_baseline_shadow_run,
    'shadow_policy_id',v_shadow_policy,'shadow_run_id',v_shadow_run,'candidate_label',v_label,
    'conditions_before',v_before,'conditions_patch',v_patch,'conditions_after',v_after,'window_days',v_days,
    'paired_same_window',true,'autonomy_tier',0,'required_approval','human','external_writes',0,
    'execution_allowed',false,'causal_attribution',false
  ));

  return jsonb_build_object(
    'review_id',v_review_id,'decision','accepted_for_shadow','recommendation_key',p_recommendation_key,
    'source_policy_id',v_source.id,'baseline_shadow_run_id',v_baseline_shadow_run,
    'shadow_policy_id',v_shadow_policy,'shadow_run_id',v_shadow_run,
    'baseline_shadow_run',v_baseline_run,'shadow_run',v_run,'paired_same_window',true,
    'policy_mutation_allowed',false,'execution_allowed',false,'causal_attribution',false,
    'message','Recommendation accepted for a paired human-reviewed counterfactual shadow test. No external action was executed.'
  );
end;
$$;

create or replace function public.integration_policy_recommendation_comparison(p_review_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public','private','pg_temp'
as $$
declare
  v_user uuid:=auth.uid();
  v_review public.integration_policy_recommendation_reviews%rowtype;
  v_baseline public.integration_shadow_runs%rowtype;
  v_experiment public.integration_shadow_runs%rowtype;
  v_base_out jsonb;
  v_exp_out jsonb;
  v_base_rate numeric;
  v_exp_rate numeric;
  v_match_delta integer;
  v_action_delta integer;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if not public.integration_automation_entitled() then raise exception 'Policy comparison requires Pro+ or Teams' using errcode='42501'; end if;

  select * into v_review from public.integration_policy_recommendation_reviews
  where id=p_review_id and user_id=v_user and decision='accepted_for_shadow'
  limit 1;
  if not found then raise exception 'Accepted recommendation review not found' using errcode='P0002'; end if;
  if v_review.baseline_shadow_run_id is null or v_review.shadow_run_id is null then
    raise exception 'Paired shadow runs are not available for this review' using errcode='23514';
  end if;

  select * into v_baseline from public.integration_shadow_runs where id=v_review.baseline_shadow_run_id and user_id=v_user;
  select * into v_experiment from public.integration_shadow_runs where id=v_review.shadow_run_id and user_id=v_user;
  if v_baseline.id is null or v_experiment.id is null then raise exception 'Shadow comparison run missing' using errcode='P0002'; end if;

  v_base_out:=public.integration_shadow_outcome_comparison(v_baseline.id);
  v_exp_out:=public.integration_shadow_outcome_comparison(v_experiment.id);
  v_base_rate:=case when coalesce((v_base_out->>'matched')::int,0)>0 then round(100.0*coalesce((v_base_out->>'matched_with_outcomes')::int,0)/((v_base_out->>'matched')::int),1) else null end;
  v_exp_rate:=case when coalesce((v_exp_out->>'matched')::int,0)>0 then round(100.0*coalesce((v_exp_out->>'matched_with_outcomes')::int,0)/((v_exp_out->>'matched')::int),1) else null end;
  v_match_delta:=v_experiment.matched-v_baseline.matched;
  v_action_delta:=v_experiment.projected_actions-v_baseline.projected_actions;

  return jsonb_build_object(
    'review_id',v_review.id,'recommendation_key',v_review.recommendation_key,'candidate_label',v_review.candidate_label,
    'source_policy_id',v_review.policy_id,'source_policy_version',v_review.source_policy_version,
    'conditions_before',v_review.conditions_before,'conditions_after',v_review.conditions_after,
    'window_days',v_review.window_days,'paired_same_window',true,
    'baseline',jsonb_build_object(
      'shadow_run_id',v_baseline.id,'events_considered',v_baseline.events_considered,'matched',v_baseline.matched,
      'skipped',v_baseline.skipped,'projected_actions',v_baseline.projected_actions,
      'matched_with_outcomes',coalesce((v_base_out->>'matched_with_outcomes')::int,0),
      'matched_outcome_rate_pct',v_base_rate,'outcome_events',coalesce((v_base_out->>'outcome_events')::int,0)
    ),
    'experiment',jsonb_build_object(
      'shadow_run_id',v_experiment.id,'events_considered',v_experiment.events_considered,'matched',v_experiment.matched,
      'skipped',v_experiment.skipped,'projected_actions',v_experiment.projected_actions,
      'matched_with_outcomes',coalesce((v_exp_out->>'matched_with_outcomes')::int,0),
      'matched_outcome_rate_pct',v_exp_rate,'outcome_events',coalesce((v_exp_out->>'outcome_events')::int,0)
    ),
    'delta',jsonb_build_object('matched',v_match_delta,'projected_actions',v_action_delta,
      'matched_outcome_rate_points',case when v_base_rate is not null and v_exp_rate is not null then v_exp_rate-v_base_rate else null end),
    'interpretation',case
      when coalesce((v_base_out->>'outcome_events')::int,0)=0 and coalesce((v_exp_out->>'outcome_events')::int,0)=0 then 'The paired replay is complete, but persisted outcome telemetry is not yet available for these matched findings.'
      else 'This comparison is descriptive. It shows paired shadow behavior and observed outcomes, but it does not establish causality or authorize a policy change.'
    end,
    'policy_mutation_allowed',false,'execution_allowed',false,'causal_attribution',false
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
      'evidence_snapshot',r.evidence_snapshot,'shadow_policy_id',r.shadow_policy_id,
      'baseline_shadow_run_id',r.baseline_shadow_run_id,'shadow_run_id',r.shadow_run_id,
      'window_days',r.window_days,'review_note',r.review_note,'created_at',r.created_at
    ) order by r.created_at desc)
    from (
      select * from public.integration_policy_recommendation_reviews
      where user_id=v_user order by created_at desc limit v_limit
    ) r
  ),'[]'::jsonb);
end;
$$;

revoke all on function public.integration_review_policy_recommendation(uuid,text,text,integer,text) from public,anon;
grant execute on function public.integration_review_policy_recommendation(uuid,text,text,integer,text) to authenticated;
revoke all on function public.integration_policy_recommendation_comparison(uuid) from public,anon;
grant execute on function public.integration_policy_recommendation_comparison(uuid) to authenticated;
revoke all on function public.integration_list_policy_recommendation_reviews(integer) from public,anon;
grant execute on function public.integration_list_policy_recommendation_reviews(integer) to authenticated;
