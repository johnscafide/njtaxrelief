-- NJW-253 entitlement hardening.
-- SECURITY DEFINER recommendation logic must explicitly enforce the same Intelligence plan boundary it would otherwise bypass.

create or replace function public.marketing_recommend_campaign_play(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  uid uuid:=auth.uid();
  c public.marketing_campaigns%rowtype;
  snap public.marketing_audience_snapshots%rowtype;
  policy constant text:='marketing-campaign-play-v1';
  plan text;
  can_pro boolean:=false;
  can_plus boolean:=false;
  norm_prof text;
  prepared boolean:=false;
  scope_count int:=0;
  finding_count int:=0;
  a_count int:=0; a_score numeric:=0; a_conf numeric:=0; a_cov numeric:=0;
  c_count int:=0; c_score numeric:=0; c_conf numeric:=0; c_cov numeric:=0;
  x_count int:=0; x_score numeric:=0; x_conf numeric:=0; x_cov numeric:=0;
  a_eligible boolean:=false; c_eligible boolean:=false; x_eligible boolean:=false;
  a_rank numeric:=0; c_rank numeric:=0; x_rank numeric:=0; fallback_rank numeric:=45;
  fallback_key text; fallback_label text; fallback_goal text; fallback_direction text;
  rec_key text; rec_label text; rec_goal text; rec_direction text; rec_rank numeric:=0; rec_conf numeric:=0; rec_cov numeric:=0;
  candidates jsonb; aggregates jsonb; reasons jsonb; manifest jsonb; hash text;
  finding_ids uuid[]:='{}'::uuid[]; run_ids uuid[]:='{}'::uuid[]; signal_ids text[]:='{}'::text[];
  existing public.marketing_campaign_recommendations%rowtype;
  rid uuid;
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  plan:=coalesce(public.watchdog_effective_plan(uid),'standard');
  can_pro:=plan in ('pro','pro_plus','teams','developer');
  can_plus:=plan in ('pro_plus','teams','developer');
  select * into c from public.marketing_campaigns where id=p_campaign_id and user_id=uid;
  if c.id is null then raise exception 'Campaign not found'; end if;
  if c.audience_snapshot_id is not null then select * into snap from public.marketing_audience_snapshots where id=c.audience_snapshot_id and user_id=uid; end if;
  norm_prof:=lower(coalesce(c.profession,''));
  if norm_prof in ('realtor','real_estate_agent','real estate agent') then norm_prof:='agent'; end if;
  if norm_prof in ('mortgage_lender','mortgage lender','mortgage_broker','mortgage broker') then norm_prof:='lender'; end if;
  if norm_prof in ('tax_attorney','tax attorney') then norm_prof:='attorney'; end if;
  prepared:=exists(select 1 from public.marketing_direct_mail_recipients r where r.campaign_id=c.id and r.user_id=uid);

  create temporary table if not exists tmp_campaign_recommendation_keys(property_key text primary key) on commit drop;
  truncate tmp_campaign_recommendation_keys;
  if prepared then
    insert into tmp_campaign_recommendation_keys(property_key)
    select distinct property_key from public.marketing_direct_mail_recipients
    where campaign_id=c.id and user_id=uid and validation_status='valid' and nullif(trim(property_key),'') is not null
    on conflict do nothing;
  elsif snap.id is not null then
    insert into tmp_campaign_recommendation_keys(property_key)
    select distinct value#>>'{}' from jsonb_array_elements(coalesce(snap.property_keys,'[]'::jsonb))
    where nullif(trim(value#>>'{}'),'') is not null on conflict do nothing;
  end if;
  select count(*) into scope_count from tmp_campaign_recommendation_keys;

  create temporary table if not exists tmp_campaign_recommendation_findings(
    id uuid,run_id uuid,pams_pin text,opportunity_type text,score numeric,confidence numeric,evidence_coverage numeric,evidence jsonb,created_at timestamptz
  ) on commit drop;
  truncate tmp_campaign_recommendation_findings;
  if can_pro then
    insert into tmp_campaign_recommendation_findings
    select id,run_id,pams_pin,opportunity_type,score,confidence,evidence_coverage,evidence,created_at
    from (
      select distinct on (f.pams_pin,f.opportunity_type) f.id,f.run_id,f.pams_pin,f.opportunity_type,f.score,f.confidence,f.evidence_coverage,f.evidence,f.created_at
      from public.intelligence_findings f join tmp_campaign_recommendation_keys k on k.property_key=f.pams_pin
      where f.user_id=uid
        and (f.opportunity_type in ('assessment_review','closing_review') or (can_plus and f.opportunity_type='change_intelligence'))
      order by f.pams_pin,f.opportunity_type,f.created_at desc
    ) q;
  end if;

  select count(*) into finding_count from tmp_campaign_recommendation_findings;
  select count(*)::int,coalesce(avg(score),0),coalesce(avg(confidence),0),coalesce(avg(evidence_coverage),0)
    into a_count,a_score,a_conf,a_cov from tmp_campaign_recommendation_findings where opportunity_type='assessment_review';
  select count(*)::int,coalesce(avg(score),0),coalesce(avg(confidence),0),coalesce(avg(evidence_coverage),0)
    into c_count,c_score,c_conf,c_cov from tmp_campaign_recommendation_findings where opportunity_type='closing_review';
  select count(*)::int,coalesce(avg(score),0),coalesce(avg(confidence),0),coalesce(avg(evidence_coverage),0)
    into x_count,x_score,x_conf,x_cov from tmp_campaign_recommendation_findings where opportunity_type='change_intelligence';

  select coalesce(array_agg(id order by score desc,confidence desc),'{}'::uuid[]) into finding_ids
  from (select id,score,confidence from tmp_campaign_recommendation_findings order by score desc,confidence desc,created_at desc limit 200) q;
  select coalesce(array_agg(run_id order by max_score desc),'{}'::uuid[]) into run_ids
  from (select run_id,max(score) max_score from tmp_campaign_recommendation_findings where run_id is not null group by run_id order by max(score) desc limit 200) q;
  select coalesce(array_agg(signal_id order by signal_id),'{}'::text[]) into signal_ids
  from (
    select distinct nullif(trim(e->>'signal_id'),'') signal_id
    from tmp_campaign_recommendation_findings f cross join lateral jsonb_array_elements(case when jsonb_typeof(f.evidence)='array' then f.evidence else '[]'::jsonb end) e
    where nullif(trim(e->>'signal_id'),'') is not null order by 1 limit 60
  ) s;

  a_eligible:=can_pro and norm_prof in ('agent','attorney','appraiser','investor');
  c_eligible:=can_pro and norm_prof in ('agent','attorney','lender');
  x_eligible:=can_plus and norm_prof in ('agent','attorney','appraiser','investor','lender');
  a_rank:=case when a_eligible and a_count>0 then least(100,a_score*.25+a_conf*.30+a_cov*.30+least(a_count,25)::numeric/25*15 + case when lower(c.goal) like '%tax%' or lower(c.goal) like '%appeal%' then 10 else 0 end) else 0 end;
  c_rank:=case when c_eligible and c_count>0 then least(100,c_score*.25+c_conf*.30+c_cov*.30+least(c_count,25)::numeric/25*15 + case when lower(c.goal) like '%lending%' then 8 when lower(c.goal)='relationship' then 3 else 0 end) else 0 end;
  x_rank:=case when x_eligible and x_count>0 then least(100,x_score*.25+x_conf*.30+x_cov*.30+least(x_count,25)::numeric/25*15 + case when lower(c.goal) in ('relationship','seller_leads','general') then 8 else 0 end) else 0 end;

  if lower(c.goal) like '%tax%' or lower(c.goal) like '%appeal%' then
    fallback_key:='property_tax_education';fallback_label:='Property Tax Review Education';fallback_goal:=c.goal;
    fallback_direction:='Create a factual property-tax review education campaign using aggregate public-record context. Do not promise savings, eligibility, valuation, or appeal outcomes and do not make recipient-specific claims.';
  elsif lower(c.goal)='property_services' or norm_prof='contractor' then
    fallback_key:='property_care_education';fallback_label:='Property Care & Records Education';fallback_goal:=c.goal;
    fallback_direction:='Create a useful property-care and public-record education campaign. Do not infer property condition, repair need, homeowner finances, or private circumstances from age or other records.';
  elsif lower(c.goal) like '%lending%' or norm_prof='lender' then
    fallback_key:='property_financing_review';fallback_label:='Property & Financing Review';fallback_goal:=c.goal;
    fallback_direction:='Create a general property and financing review campaign. Do not imply loan qualification, creditworthiness, equity, financial condition, or guaranteed lending outcomes for any recipient.';
  elsif lower(c.goal) like '%investor%' or norm_prof='investor' then
    fallback_key:='public_property_data_review';fallback_label:='Public Property-Data Review';fallback_goal:=c.goal;
    fallback_direction:='Create a public property-data review campaign. Do not infer distress, motivation, willingness to sell, financial pressure, or any private circumstance for a recipient.';
  elsif lower(c.goal)='relationship' then
    fallback_key:='local_property_update';fallback_label:='Local Property Information Update';fallback_goal:=c.goal;
    fallback_direction:='Create a useful local property-information update based on aggregate campaign facts. Keep it educational and relationship-focused without recipient-specific predictions or private-life inference.';
  else
    fallback_key:='local_market_record_review';fallback_label:='Local Market & Property Record Review';fallback_goal:=c.goal;
    fallback_direction:='Create a local market and public-record review campaign. Do not claim or imply that any recipient is likely to sell, motivated, distressed, has a particular financial position, or will achieve a guaranteed outcome.';
  end if;

  candidates:=jsonb_build_array(
    jsonb_build_object('play_key','assessment_review_education','label','Assessment Review Education','recommended_goal','tax_appeal_education','score',round(a_rank,2),'eligible',a_eligible,'evidence_type','assessment_review','finding_count',a_count,'average_confidence',round(a_conf,2),'evidence_coverage',round(a_cov,2),'creative_direction','Create an assessment-review education campaign from aggregate governed evidence. Explain that records may deserve professional review; do not determine appeal eligibility, property value, savings, or outcomes for any recipient.'),
    jsonb_build_object('play_key','closing_due_diligence_review','label','Closing & Due-Diligence Review','recommended_goal','relationship','score',round(c_rank,2),'eligible',c_eligible,'evidence_type','closing_review','finding_count',c_count,'average_confidence',round(c_conf,2),'evidence_coverage',round(c_cov,2),'creative_direction','Create a professional due-diligence education campaign from aggregate public-record exceptions. Do not make legal, title, code, insurability, financing, or transaction determinations for any recipient.'),
    jsonb_build_object('play_key','property_change_update','label','Property Change & Records Update','recommended_goal','relationship','score',round(x_rank,2),'eligible',x_eligible,'evidence_type','change_intelligence','finding_count',x_count,'average_confidence',round(x_conf,2),'evidence_coverage',round(x_cov,2),'creative_direction','Create a local property-record change and information update from aggregate governed change evidence. Do not infer seller intent, distress, private circumstances, or future behavior for any recipient.'),
    jsonb_build_object('play_key',fallback_key,'label',fallback_label,'recommended_goal',fallback_goal,'score',fallback_rank,'eligible',true,'evidence_type','campaign_fallback','finding_count',0,'average_confidence',0,'evidence_coverage',0,'creative_direction',fallback_direction)
  );

  select e->>'play_key',e->>'label',e->>'recommended_goal',e->>'creative_direction',coalesce((e->>'score')::numeric,0),
         coalesce((e->>'average_confidence')::numeric,0),coalesce((e->>'evidence_coverage')::numeric,0)
  into rec_key,rec_label,rec_goal,rec_direction,rec_rank,rec_conf,rec_cov
  from jsonb_array_elements(candidates) e
  where coalesce((e->>'eligible')::boolean,false)
  order by (e->>'score')::numeric desc,case e->>'play_key' when fallback_key then 1 else 0 end,e->>'play_key'
  limit 1;

  aggregates:=jsonb_build_object(
    'scope','campaign_aggregate_only','scope_property_count',scope_count,'finding_count',finding_count,'prepared_recipient_scope',prepared,
    'intelligence_entitlement',case when can_plus then 'pro_plus' when can_pro then 'pro' else 'campaign_fallback_only' end,
    'assessment_review',jsonb_build_object('count',a_count,'average_score',round(a_score,2),'average_confidence',round(a_conf,2),'evidence_coverage',round(a_cov,2)),
    'closing_review',jsonb_build_object('count',c_count,'average_score',round(c_score,2),'average_confidence',round(c_conf,2),'evidence_coverage',round(c_cov,2)),
    'change_intelligence',jsonb_build_object('count',x_count,'average_score',round(x_score,2),'average_confidence',round(x_conf,2),'evidence_coverage',round(x_cov,2))
  );
  reasons:=jsonb_build_array(
    'Recommendation is based on aggregate governed campaign evidence available within the current plan entitlement, not an individual homeowner prediction.',
    format('%s was the highest eligible deterministic policy score at %s.',rec_label,round(rec_rank,1)),
    case when finding_count=0 then 'No entitled Watchdog Intelligence findings were available, so the campaign-goal fallback was used.' else format('%s entitled governed findings across %s campaign properties informed the aggregate comparison.',finding_count,scope_count) end,
    'Audience membership is unchanged by this recommendation.'
  );
  manifest:=jsonb_build_object('policy_version',policy,'campaign_id',c.id,'audience_snapshot_id',c.audience_snapshot_id,'audience_snapshot_hash',snap.snapshot_hash,'original_goal',c.goal,'profession',norm_prof,'intelligence_entitlement',aggregates->>'intelligence_entitlement','opportunity_play',c.settings->>'opportunity_play','aggregates',aggregates,'candidates',candidates);
  hash:=encode(digest(manifest::text,'sha256'),'hex');

  select * into existing from public.marketing_campaign_recommendations
  where user_id=uid and campaign_id=c.id and policy_version=policy and facts_hash=hash and status<>'superseded'
  order by created_at desc limit 1;
  if existing.id is not null then return public.marketing_campaign_recommendation_state(c.id); end if;
  update public.marketing_campaign_recommendations set status='superseded',updated_at=now()
  where user_id=uid and campaign_id=c.id and status<>'superseded';
  insert into public.marketing_campaign_recommendations(
    user_id,campaign_id,audience_snapshot_id,policy_version,status,original_goal,profession,recommended_play_key,recommended_label,recommended_goal,creative_direction,rationale,aggregate_summary,candidate_scores,source_finding_ids,source_run_ids,source_signal_ids,recommendation_confidence,evidence_coverage,facts_hash
  ) values (
    uid,c.id,c.audience_snapshot_id,policy,'recommended',c.goal,norm_prof,rec_key,rec_label,rec_goal,rec_direction,reasons,aggregates,candidates,finding_ids,run_ids,signal_ids,least(100,rec_conf),least(100,rec_cov),hash
  ) returning id into rid;
  update public.marketing_campaigns set settings=
    coalesce(settings,'{}'::jsonb) || jsonb_build_object('direct_mail',coalesce(settings->'direct_mail','{}'::jsonb) || jsonb_build_object('campaign_recommendation',jsonb_build_object('id',rid,'policy_version',policy,'status','recommended','recommended_play_key',rec_key,'facts_hash',hash,'audience_membership_changed',false))),updated_at=now()
  where id=c.id and user_id=uid;
  insert into public.marketing_events(user_id,campaign_id,event_type,source,payload)
  values(uid,c.id,'campaign.recommendation_generated','watchdog_intelligence',jsonb_build_object('recommendation_id',rid,'policy_version',policy,'recommended_play_key',rec_key,'recommended_goal',rec_goal,'recommendation_confidence',round(rec_conf,2),'evidence_coverage',round(rec_cov,2),'scope_property_count',scope_count,'finding_count',finding_count,'source_signal_count',cardinality(signal_ids),'intelligence_entitlement',aggregates->>'intelligence_entitlement','audience_membership_changed',false,'auto_launch_enabled',false));
  return public.marketing_campaign_recommendation_state(c.id);
end;
$$;
revoke all on function public.marketing_recommend_campaign_play(uuid) from public,anon;
grant execute on function public.marketing_recommend_campaign_play(uuid) to authenticated;
