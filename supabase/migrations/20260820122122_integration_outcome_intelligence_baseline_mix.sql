create or replace function public.integration_outcome_intelligence_baseline_mix()
returns jsonb
language plpgsql
security definer
set search_path='public','private','pg_temp'
as $$
declare
  v_user uuid := auth.uid();
  v_opportunity jsonb;
  v_models jsonb;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if not public.integration_automation_entitled() then raise exception 'Outcome Intelligence requires Pro+ or Teams' using errcode='42501'; end if;

  with g as (
    select opportunity_type as label,count(*)::int findings,
           count(distinct pams_pin)::int properties,
           round(avg(score)::numeric,1) avg_score,
           round(avg(confidence)::numeric,1) avg_confidence
    from public.intelligence_findings
    where user_id=v_user
    group by opportunity_type
  )
  select coalesce(jsonb_agg(jsonb_build_object('label',label,'findings',findings,'properties',properties,'avg_score',avg_score,'avg_confidence',avg_confidence) order by findings desc),'[]'::jsonb)
  into v_opportunity from g;

  with g as (
    select r.model_key,r.model_version,r.engine_version,count(*)::int findings,
           count(distinct f.pams_pin)::int properties,
           round(avg(f.score)::numeric,1) avg_score,
           round(avg(f.confidence)::numeric,1) avg_confidence,
           min(f.created_at) first_finding_at,max(f.created_at) last_finding_at
    from public.intelligence_findings f
    join public.intelligence_runs r on r.id=f.run_id and r.user_id=v_user
    where f.user_id=v_user
    group by r.model_key,r.model_version,r.engine_version
  )
  select coalesce(jsonb_agg(jsonb_build_object('model_key',model_key,'model_version',model_version,'engine_version',engine_version,'findings',findings,'properties',properties,'avg_score',avg_score,'avg_confidence',avg_confidence,'first_finding_at',first_finding_at,'last_finding_at',last_finding_at) order by findings desc),'[]'::jsonb)
  into v_models from g;

  return jsonb_build_object(
    'opportunity_mix',v_opportunity,
    'model_mix',v_models,
    'interpretation','Historical mix is context only. It predates the outcome measurement epoch and is excluded from conversion-rate denominators.'
  );
end;
$$;

revoke all on function public.integration_outcome_intelligence_baseline_mix() from public,anon;
grant execute on function public.integration_outcome_intelligence_baseline_mix() to authenticated;
