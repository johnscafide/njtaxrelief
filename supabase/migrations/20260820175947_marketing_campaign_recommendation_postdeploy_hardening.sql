-- NJW-253 post-deploy hardening: current-plan redaction and anon table privilege removal.
-- Mirrors production migration 20260820175947.

revoke all on table public.marketing_campaign_recommendations from anon;
grant select on table public.marketing_campaign_recommendations to authenticated;

create or replace function public.marketing_campaign_recommendation_state(p_campaign_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path=public
as $$
declare
  uid uuid:=auth.uid();
  plan text;
  can_pro boolean:=false;
  can_plus boolean:=false;
  current_entitlement text;
  stored_entitlement text;
  r public.marketing_campaign_recommendations%rowtype;
  visible_candidates jsonb:='[]'::jsonb;
  visible_recommended jsonb;
  visible_selected jsonb;
  visible_decision_key text;
  visible_finding_ids uuid[]:='{}'::uuid[];
  visible_run_ids uuid[]:='{}'::uuid[];
  visible_signal_ids text[]:='{}'::text[];
  safe_aggregates jsonb;
  safe_rationale jsonb;
  zero_bucket jsonb:=jsonb_build_object('count',0,'average_score',0,'average_confidence',0,'evidence_coverage',0);
  plan_changed boolean:=false;
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  if not exists(select 1 from public.marketing_campaigns c where c.id=p_campaign_id and c.user_id=uid) then raise exception 'Campaign not found'; end if;

  plan:=coalesce(public.watchdog_effective_plan(uid),'standard');
  can_pro:=plan in ('pro','pro_plus','teams','developer');
  can_plus:=plan in ('pro_plus','teams','developer');
  current_entitlement:=case when can_plus then 'pro_plus' when can_pro then 'pro' else 'campaign_fallback_only' end;

  select * into r
  from public.marketing_campaign_recommendations
  where campaign_id=p_campaign_id and user_id=uid and status<>'superseded'
  order by created_at desc limit 1;

  if r.id is null then
    return jsonb_build_object('exists',false,'campaign_id',p_campaign_id,'policy_version','marketing-campaign-play-v1','intelligence_entitlement',current_entitlement);
  end if;

  stored_entitlement:=coalesce(r.aggregate_summary->>'intelligence_entitlement','campaign_fallback_only');
  plan_changed:=stored_entitlement<>current_entitlement;

  select coalesce(jsonb_agg(e order by coalesce((e->>'score')::numeric,0) desc,e->>'play_key'),'[]'::jsonb)
  into visible_candidates
  from jsonb_array_elements(case when jsonb_typeof(r.candidate_scores)='array' then r.candidate_scores else '[]'::jsonb end) e
  where e->>'evidence_type'='campaign_fallback'
     or (can_pro and e->>'evidence_type' in ('assessment_review','closing_review'))
     or (can_plus and e->>'evidence_type'='change_intelligence');

  select e into visible_recommended
  from jsonb_array_elements(visible_candidates) e
  where e->>'play_key'=r.recommended_play_key
  limit 1;
  if visible_recommended is null then
    select e into visible_recommended
    from jsonb_array_elements(visible_candidates) e
    where coalesce((e->>'eligible')::boolean,false)
    order by coalesce((e->>'score')::numeric,0) desc,
             case when e->>'evidence_type'='campaign_fallback' then 1 else 0 end,
             e->>'play_key'
    limit 1;
  end if;

  if r.decision_play_key is not null then
    select e into visible_selected
    from jsonb_array_elements(visible_candidates) e
    where e->>'play_key'=r.decision_play_key
    limit 1;
    if visible_selected is not null then visible_decision_key:=r.decision_play_key; end if;
  end if;
  if visible_selected is null then visible_selected:=visible_recommended; end if;

  if can_pro then
    select coalesce(array_agg(f.id order by f.score desc,f.confidence desc),'{}'::uuid[])
    into visible_finding_ids
    from public.intelligence_findings f
    where f.user_id=uid and f.id=any(r.source_finding_ids)
      and (f.opportunity_type in ('assessment_review','closing_review') or (can_plus and f.opportunity_type='change_intelligence'));

    select coalesce(array_agg(run_id order by max_score desc),'{}'::uuid[])
    into visible_run_ids
    from (
      select f.run_id,max(f.score) max_score
      from public.intelligence_findings f
      where f.user_id=uid and f.id=any(visible_finding_ids) and f.run_id is not null
      group by f.run_id
      order by max(f.score) desc
      limit 200
    ) q;

    select coalesce(array_agg(signal_id order by signal_id),'{}'::text[])
    into visible_signal_ids
    from (
      select distinct nullif(trim(e->>'signal_id'),'') signal_id
      from public.intelligence_findings f
      cross join lateral jsonb_array_elements(case when jsonb_typeof(f.evidence)='array' then f.evidence else '[]'::jsonb end) e
      where f.user_id=uid and f.id=any(visible_finding_ids) and nullif(trim(e->>'signal_id'),'') is not null
      order by 1 limit 60
    ) s;
  end if;

  if can_plus then
    safe_aggregates:=r.aggregate_summary || jsonb_build_object('intelligence_entitlement',current_entitlement);
  elsif can_pro then
    safe_aggregates:=jsonb_build_object(
      'scope','campaign_aggregate_only',
      'scope_property_count',coalesce((r.aggregate_summary->>'scope_property_count')::int,0),
      'finding_count',coalesce((r.aggregate_summary->'assessment_review'->>'count')::int,0)+coalesce((r.aggregate_summary->'closing_review'->>'count')::int,0),
      'prepared_recipient_scope',coalesce((r.aggregate_summary->>'prepared_recipient_scope')::boolean,false),
      'intelligence_entitlement',current_entitlement,
      'assessment_review',coalesce(r.aggregate_summary->'assessment_review',zero_bucket),
      'closing_review',coalesce(r.aggregate_summary->'closing_review',zero_bucket),
      'change_intelligence',zero_bucket
    );
  else
    safe_aggregates:=jsonb_build_object(
      'scope','campaign_aggregate_only',
      'scope_property_count',coalesce((r.aggregate_summary->>'scope_property_count')::int,0),
      'finding_count',0,
      'prepared_recipient_scope',coalesce((r.aggregate_summary->>'prepared_recipient_scope')::boolean,false),
      'intelligence_entitlement',current_entitlement,
      'assessment_review',zero_bucket,
      'closing_review',zero_bucket,
      'change_intelligence',zero_bucket
    );
  end if;

  safe_rationale:=jsonb_build_array(
    'Recommendation is based on aggregate governed campaign evidence available within the current plan entitlement, not an individual homeowner prediction.',
    format('%s is the highest currently visible governed campaign direction.',coalesce(visible_recommended->>'label','Campaign goal fallback')),
    'Audience membership is unchanged by this recommendation.'
  );

  return jsonb_build_object(
    'exists',true,'id',r.id,'campaign_id',r.campaign_id,'audience_snapshot_id',r.audience_snapshot_id,
    'policy_version',r.policy_version,'status',r.status,'original_goal',r.original_goal,'profession',r.profession,
    'recommended_play_key',visible_recommended->>'play_key','recommended_label',visible_recommended->>'label','recommended_goal',visible_recommended->>'recommended_goal',
    'creative_direction',visible_recommended->>'creative_direction','rationale',safe_rationale,'aggregate_summary',safe_aggregates,'candidate_scores',visible_candidates,
    'source_finding_count',cardinality(visible_finding_ids),'source_run_count',cardinality(visible_run_ids),'source_signal_ids',to_jsonb(visible_signal_ids),
    'recommendation_confidence',coalesce((visible_recommended->>'average_confidence')::numeric,0),'evidence_coverage',coalesce((visible_recommended->>'evidence_coverage')::numeric,0),
    'facts_hash',case when plan_changed then null else r.facts_hash end,
    'decision_play_key',visible_decision_key,'decision_reason',case when visible_decision_key is null and r.decision_play_key is not null then null else r.decision_reason end,
    'decided_at',case when visible_decision_key is null and r.decision_play_key is not null then null else r.decided_at end,
    'selected_candidate',visible_selected,'created_at',r.created_at,'updated_at',r.updated_at,
    'intelligence_entitlement',current_entitlement,'stored_intelligence_entitlement',stored_entitlement,'plan_context_changed',plan_changed,
    'entitlement_redacted',plan_changed and ((stored_entitlement='pro_plus' and not can_plus) or (stored_entitlement='pro' and not can_pro)),
    'audience_membership_changed',false,'auto_launch_enabled',false,'proof_approval_bypassed',false
  );
end;
$$;
revoke all on function public.marketing_campaign_recommendation_state(uuid) from public,anon;
grant execute on function public.marketing_campaign_recommendation_state(uuid) to authenticated;

create or replace function public.marketing_set_campaign_recommendation_decision(
  p_campaign_id uuid,
  p_recommendation_id uuid,
  p_decision text,
  p_override_play_key text default null,
  p_override_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid:=auth.uid();
  r public.marketing_campaign_recommendations%rowtype;
  current_state jsonb;
  decision text:=lower(trim(coalesce(p_decision,'')));
  chosen text;
  candidate jsonb;
  reason text:=nullif(trim(coalesce(p_override_reason,'')),'');
  next_status text;
  dm jsonb;
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  select * into r from public.marketing_campaign_recommendations where id=p_recommendation_id and campaign_id=p_campaign_id and user_id=uid for update;
  if r.id is null or r.status='superseded' then raise exception 'Campaign recommendation not found'; end if;
  if decision not in ('accept','override','dismiss') then raise exception 'Decision must be accept, override, or dismiss'; end if;

  current_state:=public.marketing_campaign_recommendation_state(p_campaign_id);
  if coalesce((current_state->>'exists')::boolean,false) is not true or current_state->>'id'<>r.id::text then raise exception 'Campaign recommendation is not current'; end if;

  if decision='accept' then
    chosen:=nullif(current_state->>'recommended_play_key','');
    if chosen is null then raise exception 'No governed recommendation is available under the current plan'; end if;
    next_status:='accepted';
  elsif decision='override' then
    chosen:=nullif(trim(coalesce(p_override_play_key,'')),'');
    if chosen is null then raise exception 'Override play is required'; end if;
    select e into candidate
    from jsonb_array_elements(coalesce(current_state->'candidate_scores','[]'::jsonb)) e
    where e->>'play_key'=chosen and coalesce((e->>'eligible')::boolean,false)
    limit 1;
    if candidate is null then raise exception 'Override play is not an eligible governed candidate under the current plan'; end if;
    next_status:='overridden';
  else
    chosen:=null;
    next_status:='dismissed';
  end if;

  if decision='override' and (reason is null or length(reason)<2) then reason:='User selected an alternative governed campaign direction.'; end if;
  if length(coalesce(reason,''))>500 then reason:=left(reason,500); end if;

  update public.marketing_campaign_recommendations
  set status=next_status,decision_play_key=chosen,decision_reason=reason,decided_at=now(),updated_at=now()
  where id=r.id;

  if chosen is not null then
    select e into candidate from jsonb_array_elements(coalesce(current_state->'candidate_scores','[]'::jsonb)) e where e->>'play_key'=chosen limit 1;
  else
    candidate:=null;
  end if;

  dm:=jsonb_build_object(
    'id',r.id,'policy_version',r.policy_version,'status',next_status,'recommended_play_key',current_state->>'recommended_play_key',
    'selected_play_key',chosen,'selected_goal',candidate->>'recommended_goal','selected_creative_direction',candidate->>'creative_direction',
    'decision_reason',reason,'decided_at',now(),'intelligence_entitlement',current_state->>'intelligence_entitlement',
    'audience_membership_changed',false,'auto_launch_enabled',false,'proof_approval_bypassed',false
  );

  update public.marketing_campaigns set settings=
    coalesce(settings,'{}'::jsonb) || jsonb_build_object('direct_mail',coalesce(settings->'direct_mail','{}'::jsonb) || jsonb_build_object('campaign_recommendation',dm)),updated_at=now()
  where id=p_campaign_id and user_id=uid;

  insert into public.marketing_events(user_id,campaign_id,event_type,source,payload)
  values(uid,p_campaign_id,'campaign.recommendation_decision','watchdog',jsonb_build_object(
    'recommendation_id',r.id,'decision',decision,'status',next_status,'recommended_play_key',current_state->>'recommended_play_key',
    'selected_play_key',chosen,'reason',reason,'intelligence_entitlement',current_state->>'intelligence_entitlement',
    'audience_membership_changed',false,'auto_launch_enabled',false
  ));

  return public.marketing_campaign_recommendation_state(p_campaign_id);
end;
$$;
revoke all on function public.marketing_set_campaign_recommendation_decision(uuid,uuid,text,text,text) from public,anon;
grant execute on function public.marketing_set_campaign_recommendation_decision(uuid,uuid,text,text,text) to authenticated;
