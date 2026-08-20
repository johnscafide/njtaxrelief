create or replace function public.integration_list_shadow_outcome_runs(p_limit integer default 12)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_user uuid:=auth.uid(); v_limit int:=greatest(1,least(coalesce(p_limit,12),50)); v_rows jsonb;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if not public.integration_automation_entitled() then raise exception 'Outcome comparison requires Pro+ or Teams' using errcode='42501'; end if;
  select coalesce(jsonb_agg(x order by x.completed_at desc nulls last),'[]'::jsonb) into v_rows from (
    select sr.id as shadow_run_id,sr.policy_id,sr.window_days,sr.events_considered,sr.matched,sr.skipped,sr.projected_actions,sr.started_at,sr.completed_at,
      ap.name as policy_name,ap.version as policy_version,
      (select count(distinct pe.id)::int from public.integration_policy_evaluations pe join public.integration_events ie on ie.id=pe.event_id and ie.user_id=v_user where pe.shadow_run_id=sr.id and pe.user_id=v_user and pe.result='matched' and exists(select 1 from public.intelligence_outcome_events oe where oe.user_id=v_user and oe.finding_id=case when (pe.decision->>'finding_id') ~* '^[0-9a-f-]{36}$' then (pe.decision->>'finding_id')::uuid else null end and oe.occurred_at>=ie.occurred_at)) as matched_with_outcomes,
      (select count(*)::int from public.integration_policy_evaluations pe join public.integration_events ie on ie.id=pe.event_id and ie.user_id=v_user join public.intelligence_outcome_events oe on oe.user_id=v_user and oe.finding_id=case when (pe.decision->>'finding_id') ~* '^[0-9a-f-]{36}$' then (pe.decision->>'finding_id')::uuid else null end and oe.occurred_at>=ie.occurred_at where pe.shadow_run_id=sr.id and pe.user_id=v_user and pe.result='matched') as outcome_events
    from public.integration_shadow_runs sr join public.integration_automation_policies ap on ap.id=sr.policy_id and ap.user_id=v_user
    where sr.user_id=v_user order by sr.completed_at desc nulls last limit v_limit
  ) x;
  return jsonb_build_object('runs',v_rows,'count',jsonb_array_length(v_rows),'execution_allowed',false);
end; $$;
revoke execute on function public.integration_list_shadow_outcome_runs(integer) from public,anon;
grant execute on function public.integration_list_shadow_outcome_runs(integer) to authenticated;