create table if not exists public.integration_automation_proofs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  proof_key text not null unique,
  event_id uuid references public.integration_events(id) on delete set null,
  finding_id uuid references public.intelligence_findings(id) on delete set null,
  run_id uuid references public.intelligence_runs(id) on delete set null,
  pams_pin text,
  policy_id uuid references public.integration_automation_policies(id) on delete set null,
  policy_evaluation_id uuid references public.integration_policy_evaluations(id) on delete set null,
  facts_hash text,
  envelope jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.integration_automation_proofs enable row level security;
revoke all on public.integration_automation_proofs from anon, authenticated;
create index if not exists integration_automation_proofs_user_created_idx on public.integration_automation_proofs(user_id, created_at desc);
create index if not exists integration_automation_proofs_event_idx on public.integration_automation_proofs(event_id) where event_id is not null;
create index if not exists integration_automation_proofs_finding_idx on public.integration_automation_proofs(finding_id) where finding_id is not null;
create index if not exists integration_automation_proofs_policy_idx on public.integration_automation_proofs(policy_id) where policy_id is not null;
create index if not exists integration_automation_proofs_evaluation_idx on public.integration_automation_proofs(policy_evaluation_id) where policy_evaluation_id is not null;

create or replace function public.integration_save_shadow_policy(
  p_name text,p_trigger_event_type text,p_conditions jsonb default '{}'::jsonb,p_action_plan jsonb default '{"actions":[]}'::jsonb,p_policy_group_id uuid default null,p_status text default 'shadow',p_autonomy_tier integer default 0,p_required_approval text default 'human'
) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare v_user uuid:=auth.uid(); v_allowed boolean:=false; v_group uuid:=coalesce(p_policy_group_id,gen_random_uuid()); v_version integer:=1; v_id uuid; v_actions jsonb; v_action jsonb; v_bad_key text;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select exists(select 1 from public.profiles p where p.id=v_user and p.account_role='developer') or exists(select 1 from public.account_entitlements e where e.user_id=v_user and e.plan_tier in ('pro_plus','teams','developer') and e.subscription_status in ('active','trialing','past_due','cancel_scheduled')) into v_allowed;
  if not v_allowed then raise exception 'Shadow automation policies require Pro+ or Teams' using errcode='42501'; end if;
  if nullif(trim(p_name),'') is null or nullif(trim(p_trigger_event_type),'') is null then raise exception 'Policy name and event type are required' using errcode='23514'; end if;
  if p_status not in ('draft','shadow','paused') then raise exception 'Only draft, shadow, or paused policy states are allowed in this phase' using errcode='23514'; end if;
  if coalesce(p_autonomy_tier,0) not between 0 and 4 then raise exception 'Invalid autonomy tier' using errcode='23514'; end if;
  if coalesce(p_required_approval,'human') not in ('none','human','always') then raise exception 'Invalid approval mode' using errcode='23514'; end if;
  if jsonb_typeof(coalesce(p_conditions,'{}'::jsonb))<>'object' or length(coalesce(p_conditions,'{}'::jsonb)::text)>16000 then raise exception 'Invalid conditions contract' using errcode='23514'; end if;
  select key into v_bad_key from jsonb_object_keys(coalesce(p_conditions,'{}'::jsonb)) key where key not in ('min_score','min_confidence','allowed_severity','min_materiality','min_evidence_coverage','max_evidence_age_hours','required_authority','require_verified_relationship') limit 1;
  if v_bad_key is not null then raise exception 'Unsupported policy condition: %',v_bad_key using errcode='23514'; end if;
  begin
    if p_conditions ? 'min_score' and (p_conditions->>'min_score')::numeric not between 0 and 100 then raise exception 'min_score must be 0-100'; end if;
    if p_conditions ? 'min_confidence' and (p_conditions->>'min_confidence')::numeric not between 0 and 100 then raise exception 'min_confidence must be 0-100'; end if;
    if p_conditions ? 'min_materiality' and (p_conditions->>'min_materiality')::numeric not between 0 and 100 then raise exception 'min_materiality must be 0-100'; end if;
    if p_conditions ? 'min_evidence_coverage' and (p_conditions->>'min_evidence_coverage')::numeric not between 0 and 100 then raise exception 'min_evidence_coverage must be 0-100'; end if;
    if p_conditions ? 'max_evidence_age_hours' and (p_conditions->>'max_evidence_age_hours')::numeric <= 0 then raise exception 'max_evidence_age_hours must be positive'; end if;
  exception when invalid_text_representation then raise exception 'Policy numeric conditions must be numeric' using errcode='23514'; end;
  if p_conditions ? 'allowed_severity' and jsonb_typeof(p_conditions->'allowed_severity')<>'array' then raise exception 'allowed_severity must be an array' using errcode='23514'; end if;
  if p_conditions ? 'required_authority' and p_conditions->>'required_authority' not in ('any','governed') then raise exception 'required_authority must be any or governed' using errcode='23514'; end if;
  if p_conditions ? 'require_verified_relationship' and jsonb_typeof(p_conditions->'require_verified_relationship')<>'boolean' then raise exception 'require_verified_relationship must be boolean' using errcode='23514'; end if;
  if jsonb_typeof(coalesce(p_action_plan,'{}'::jsonb))<>'object' or length(coalesce(p_action_plan,'{}'::jsonb)::text)>24000 then raise exception 'Invalid action plan contract' using errcode='23514'; end if;
  v_actions:=coalesce(p_action_plan->'actions','[]'::jsonb);
  if jsonb_typeof(v_actions)<>'array' or jsonb_array_length(v_actions)>10 then raise exception 'Action plan supports at most 10 shadow actions' using errcode='23514'; end if;
  for v_action in select value from jsonb_array_elements(v_actions) loop
    if jsonb_typeof(v_action)<>'object' or nullif(trim(v_action->>'type'),'') is null then raise exception 'Each shadow action requires a type' using errcode='23514'; end if;
    if length(v_action->>'type')>100 or length(coalesce(v_action->>'target_system',''))>100 then raise exception 'Shadow action fields are too long' using errcode='23514'; end if;
    if v_action ? 'external_write' and jsonb_typeof(v_action->'external_write')<>'boolean' then raise exception 'external_write must be boolean' using errcode='23514'; end if;
  end loop;
  if p_policy_group_id is not null then
    if not exists(select 1 from public.integration_automation_policies where user_id=v_user and policy_group_id=p_policy_group_id) then raise exception 'Policy group not found' using errcode='P0002'; end if;
    select coalesce(max(version),0)+1 into v_version from public.integration_automation_policies where user_id=v_user and policy_group_id=p_policy_group_id;
  end if;
  insert into public.integration_automation_policies(policy_group_id,user_id,name,version,status,trigger_event_type,conditions,action_plan,autonomy_tier,required_approval) values(v_group,v_user,left(trim(p_name),120),v_version,p_status,left(trim(p_trigger_event_type),120),coalesce(p_conditions,'{}'::jsonb),coalesce(p_action_plan,'{"actions":[]}'::jsonb),coalesce(p_autonomy_tier,0),coalesce(p_required_approval,'human')) returning id into v_id;
  insert into public.integration_audit_log(user_id,connection_id,action,actor,details) values(v_user,null,'automation.policy.version_created','user',jsonb_build_object('policy_id',v_id,'policy_group_id',v_group,'version',v_version,'status',p_status,'autonomy_tier',coalesce(p_autonomy_tier,0),'conditions',coalesce(p_conditions,'{}'::jsonb)));
  return jsonb_build_object('id',v_id,'policy_group_id',v_group,'version',v_version,'status',p_status,'shadow_only',true);
end; $$;

create or replace function public.integration_run_shadow_policy(p_policy_id uuid, p_window_days integer default 30) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v_user uuid:=auth.uid(); v_allowed boolean:=false; v_policy public.integration_automation_policies%rowtype; v_run uuid:=gen_random_uuid(); v_days integer:=greatest(1,least(coalesce(p_window_days,30),90)); v_event public.integration_events%rowtype; v_eval uuid; v_action jsonb;
  v_considered integer:=0; v_matched integer:=0; v_skipped integer:=0; v_blocked integer:=0; v_projected integer:=0; v_result text; v_reasons text[]; v_score numeric; v_conf numeric; v_cov numeric; v_materiality numeric; v_severity text; v_threshold numeric;
  v_finding_id uuid; v_pin text; v_evidence jsonb; v_evidence_count integer; v_governed_count integer; v_authority_ratio numeric; v_oldest_observed timestamptz; v_evidence_age_hours numeric; v_relationship_verified boolean;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select exists(select 1 from public.profiles p where p.id=v_user and p.account_role='developer') or exists(select 1 from public.account_entitlements e where e.user_id=v_user and e.plan_tier in ('pro_plus','teams','developer') and e.subscription_status in ('active','trialing','past_due','cancel_scheduled')) into v_allowed;
  if not v_allowed then raise exception 'Shadow automation policies require Pro+ or Teams' using errcode='42501'; end if;
  select * into v_policy from public.integration_automation_policies where id=p_policy_id and user_id=v_user; if not found then raise exception 'Policy not found' using errcode='P0002'; end if;
  if v_policy.status<>'shadow' then raise exception 'Only shadow policies can be replayed' using errcode='23514'; end if;
  if v_policy.expires_at is not null and v_policy.expires_at<=now() then raise exception 'Policy version is expired' using errcode='23514'; end if;
  insert into public.integration_shadow_runs(id,user_id,policy_id,window_days) values(v_run,v_user,v_policy.id,v_days);
  for v_event in select * from public.integration_events where user_id=v_user and event_type=v_policy.trigger_event_type and occurred_at>=now()-(v_days||' days')::interval order by occurred_at asc loop
    v_considered:=v_considered+1; v_result:='matched'; v_reasons:='{}'::text[]; v_score:=null; v_conf:=null; v_cov:=null; v_materiality:=null; v_finding_id:=null; v_pin:=null; v_evidence:='[]'::jsonb; v_evidence_count:=0; v_governed_count:=0; v_authority_ratio:=null; v_oldest_observed:=null; v_evidence_age_hours:=null; v_relationship_verified:=false;
    v_severity:=coalesce(v_event.payload->>'severity',v_event.payload#>>'{finding,severity}',v_event.payload#>>'{data,severity}');
    begin v_score:=coalesce(nullif(v_event.payload->>'score','')::numeric,nullif(v_event.payload#>>'{finding,score}','')::numeric,nullif(v_event.payload#>>'{data,score}','')::numeric); exception when others then v_score:=null; end;
    begin v_conf:=coalesce(nullif(v_event.payload->>'confidence','')::numeric,nullif(v_event.payload#>>'{finding,confidence}','')::numeric,nullif(v_event.payload#>>'{data,confidence}','')::numeric); exception when others then v_conf:=null; end;
    begin v_cov:=coalesce(nullif(v_event.payload->>'evidence_coverage','')::numeric,nullif(v_event.payload#>>'{finding,evidence_coverage}','')::numeric,nullif(v_event.payload#>>'{data,evidence_coverage}','')::numeric); exception when others then v_cov:=null; end;
    if v_score is not null and v_conf is not null and v_cov is not null then v_materiality:=round(v_score*(v_conf/100.0)*(v_cov/100.0),2); end if;
    begin v_finding_id:=nullif(v_event.payload->>'finding_id','')::uuid; exception when others then v_finding_id:=null; end;
    if v_finding_id is not null then
      select f.pams_pin,coalesce(f.evidence,'[]'::jsonb) into v_pin,v_evidence from public.intelligence_findings f where f.id=v_finding_id and f.user_id=v_user;
      if found and jsonb_typeof(v_evidence)='array' then
        select count(*)::int,count(*) filter(where elem#>>'{lineage,provider_kind}'='derived_governed' and coalesce(elem#>>'{lineage,status}','available')='available')::int,min(case when elem->>'observed_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (elem->>'observed_at')::timestamptz end) into v_evidence_count,v_governed_count,v_oldest_observed from jsonb_array_elements(v_evidence) elem;
        if v_evidence_count>0 then v_authority_ratio:=round((100.0*v_governed_count/v_evidence_count),2); end if;
        if v_oldest_observed is not null then v_evidence_age_hours:=round(extract(epoch from (now()-v_oldest_observed))/3600.0,2); end if;
      end if;
    end if;
    if v_pin is null then v_pin:=nullif(v_event.payload->>'pams_pin',''); end if;
    if v_pin is not null then select exists(select 1 from public.integration_crm_property_links l where l.user_id=v_user and l.pams_pin=v_pin and l.status='verified' and l.verified_at is not null) into v_relationship_verified; end if;
    if v_policy.conditions ? 'min_score' then v_threshold:=(v_policy.conditions->>'min_score')::numeric; if v_score is null then v_result:='skipped'; v_reasons:=array_append(v_reasons,'score_missing'); elsif v_score<v_threshold then v_result:='skipped'; v_reasons:=array_append(v_reasons,'score_below_threshold'); end if; end if;
    if v_result<>'blocked' and v_policy.conditions ? 'min_confidence' then v_threshold:=(v_policy.conditions->>'min_confidence')::numeric; if v_conf is null then v_result:='skipped'; v_reasons:=array_append(v_reasons,'confidence_missing'); elsif v_conf<v_threshold then v_result:='skipped'; v_reasons:=array_append(v_reasons,'confidence_below_threshold'); end if; end if;
    if v_result<>'blocked' and v_policy.conditions ? 'min_materiality' then v_threshold:=(v_policy.conditions->>'min_materiality')::numeric; if v_materiality is null then v_result:='skipped'; v_reasons:=array_append(v_reasons,'materiality_missing'); elsif v_materiality<v_threshold then v_result:='skipped'; v_reasons:=array_append(v_reasons,'materiality_below_threshold'); end if; end if;
    if v_result<>'blocked' and v_policy.conditions ? 'min_evidence_coverage' then v_threshold:=(v_policy.conditions->>'min_evidence_coverage')::numeric; if v_cov is null then v_result:='skipped'; v_reasons:=array_append(v_reasons,'evidence_coverage_missing'); elsif v_cov<v_threshold then v_result:='skipped'; v_reasons:=array_append(v_reasons,'evidence_coverage_below_threshold'); end if; end if;
    if v_result<>'blocked' and v_policy.conditions ? 'max_evidence_age_hours' then v_threshold:=(v_policy.conditions->>'max_evidence_age_hours')::numeric; if v_evidence_age_hours is null then v_result:='skipped'; v_reasons:=array_append(v_reasons,'evidence_freshness_missing'); elsif v_evidence_age_hours>v_threshold then v_result:='skipped'; v_reasons:=array_append(v_reasons,'evidence_too_old'); end if; end if;
    if v_result<>'blocked' and coalesce(v_policy.conditions->>'required_authority','any')='governed' then if v_evidence_count=0 then v_result:='skipped'; v_reasons:=array_append(v_reasons,'evidence_authority_missing'); elsif coalesce(v_authority_ratio,0)<100 then v_result:='skipped'; v_reasons:=array_append(v_reasons,'evidence_not_fully_governed'); end if; end if;
    if v_result<>'blocked' and coalesce((v_policy.conditions->>'require_verified_relationship')::boolean,false) and not v_relationship_verified then v_result:='skipped'; v_reasons:=array_append(v_reasons,'verified_relationship_required'); end if;
    if v_result<>'blocked' and v_policy.conditions ? 'allowed_severity' then if jsonb_typeof(v_policy.conditions->'allowed_severity')<>'array' then v_result:='blocked'; v_reasons:=array_append(v_reasons,'invalid_allowed_severity'); elsif v_severity is null then v_result:='skipped'; v_reasons:=array_append(v_reasons,'severity_missing'); elsif not exists(select 1 from jsonb_array_elements_text(v_policy.conditions->'allowed_severity') a where lower(a)=lower(v_severity)) then v_result:='skipped'; v_reasons:=array_append(v_reasons,'severity_not_allowed'); end if; end if;
    if v_result='matched' then v_matched:=v_matched+1; elsif v_result='blocked' then v_blocked:=v_blocked+1; else v_skipped:=v_skipped+1; end if;
    insert into public.integration_policy_evaluations(user_id,policy_id,shadow_run_id,event_id,result,reasons,decision) values(v_user,v_policy.id,v_run,v_event.id,v_result,v_reasons,jsonb_build_object('score',v_score,'confidence',v_conf,'evidence_coverage',v_cov,'materiality',v_materiality,'evidence_count',v_evidence_count,'governed_evidence_ratio',v_authority_ratio,'oldest_evidence_age_hours',v_evidence_age_hours,'verified_relationship',v_relationship_verified,'finding_id',v_finding_id,'pams_pin',v_pin,'conditions',v_policy.conditions,'policy_version',v_policy.version,'autonomy_tier',v_policy.autonomy_tier,'executed',false)) returning id into v_eval;
    if v_result='matched' then for v_action in select value from jsonb_array_elements(coalesce(v_policy.action_plan->'actions','[]'::jsonb)) loop insert into public.integration_shadow_actions(user_id,shadow_run_id,evaluation_id,action_type,target_system,would_write_external,projected_payload,blocked_reason) values(v_user,v_run,v_eval,left(coalesce(v_action->>'type','unspecified'),100),left(v_action->>'target_system',100),coalesce((v_action->>'external_write')::boolean,false),jsonb_build_object('event_id',v_event.id,'event_type',v_event.event_type,'event_key',v_event.event_key,'finding_id',v_finding_id,'pams_pin',v_pin,'policy_version',v_policy.version,'action',v_action),'shadow_mode_no_execution'); v_projected:=v_projected+1; end loop; end if;
  end loop;
  update public.integration_shadow_runs set events_considered=v_considered,matched=v_matched,skipped=v_skipped+v_blocked,projected_actions=v_projected,summary=jsonb_build_object('policy_version',v_policy.version,'trigger_event_type',v_policy.trigger_event_type,'autonomy_tier',v_policy.autonomy_tier,'required_approval',v_policy.required_approval,'blocked',v_blocked,'execution_allowed',false),completed_at=now() where id=v_run;
  insert into public.integration_audit_log(user_id,connection_id,action,actor,details) values(v_user,null,'automation.shadow_replay.completed','user',jsonb_build_object('shadow_run_id',v_run,'policy_id',v_policy.id,'window_days',v_days,'events_considered',v_considered,'matched',v_matched,'skipped',v_skipped,'blocked',v_blocked,'projected_actions',v_projected,'external_writes',0));
  return jsonb_build_object('shadow_run_id',v_run,'policy_id',v_policy.id,'window_days',v_days,'events_considered',v_considered,'matched',v_matched,'skipped',v_skipped,'blocked',v_blocked,'projected_actions',v_projected,'execution_allowed',false,'message','Shadow replay completed. No external action was executed.');
end; $$;

create or replace function public.integration_create_finding_proof(p_finding_id uuid, p_policy_evaluation_id uuid default null) returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  v_user uuid:=auth.uid(); v_allowed boolean:=false; v_f public.intelligence_findings%rowtype; v_r public.intelligence_runs%rowtype; v_e public.integration_events%rowtype; v_eval public.integration_policy_evaluations%rowtype; v_policy public.integration_automation_policies%rowtype;
  v_refs jsonb:='[]'::jsonb; v_rel jsonb:='null'::jsonb; v_pol jsonb:='null'::jsonb; v_oldest timestamptz; v_newest timestamptz; v_count int:=0; v_governed int:=0; v_proof_key text; v_envelope jsonb; v_id uuid; v_have_eval boolean:=false;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select exists(select 1 from public.profiles p where p.id=v_user and p.account_role='developer') or exists(select 1 from public.account_entitlements e where e.user_id=v_user and e.plan_tier in ('pro_plus','teams','developer') and e.subscription_status in ('active','trialing','past_due','cancel_scheduled')) into v_allowed;
  if not v_allowed then raise exception 'Automation proofs require Pro+ or Teams' using errcode='42501'; end if;
  select * into v_f from public.intelligence_findings where id=p_finding_id and user_id=v_user; if not found then raise exception 'Finding not found' using errcode='P0002'; end if;
  select * into v_r from public.intelligence_runs where id=v_f.run_id and user_id=v_user;
  select * into v_e from public.integration_events where user_id=v_user and event_type='intelligence.finding.created' and payload->>'finding_id'=v_f.id::text order by occurred_at desc limit 1; if not found then raise exception 'Governed integration event not found for finding' using errcode='P0002'; end if;
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('signal_id',elem->>'signal_id','source_key',elem->>'source_key','source_url',elem->>'source_url','observed_at',elem->>'observed_at','role',elem->>'role','lineage',jsonb_strip_nulls(jsonb_build_object('provider_kind',elem#>>'{lineage,provider_kind}','status',elem#>>'{lineage,status}','engine_version',elem#>>'{lineage,engine_version}','dependencies',elem#>'{lineage,dependencies}')))) order by elem->>'signal_id'),'[]'::jsonb),count(*)::int,count(*) filter(where elem#>>'{lineage,provider_kind}'='derived_governed' and coalesce(elem#>>'{lineage,status}','available')='available')::int,min(case when elem->>'observed_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (elem->>'observed_at')::timestamptz end),max(case when elem->>'observed_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (elem->>'observed_at')::timestamptz end) into v_refs,v_count,v_governed,v_oldest,v_newest from jsonb_array_elements(coalesce(v_f.evidence,'[]'::jsonb)) elem;
  select jsonb_strip_nulls(jsonb_build_object('link_id',l.id,'status',l.status,'confidence',l.confidence,'verified_at',l.verified_at,'link_method',l.link_method)) into v_rel from public.integration_crm_property_links l where l.user_id=v_user and l.pams_pin=v_f.pams_pin and l.status='verified' and l.verified_at is not null order by l.verified_at desc limit 1;
  if p_policy_evaluation_id is not null then select * into v_eval from public.integration_policy_evaluations where id=p_policy_evaluation_id and user_id=v_user and event_id=v_e.id; v_have_eval:=found; else select * into v_eval from public.integration_policy_evaluations where user_id=v_user and event_id=v_e.id order by created_at desc limit 1; v_have_eval:=found; end if;
  if v_have_eval then select * into v_policy from public.integration_automation_policies where id=v_eval.policy_id and user_id=v_user; if found then v_pol:=jsonb_strip_nulls(jsonb_build_object('policy_id',v_policy.id,'policy_group_id',v_policy.policy_group_id,'version',v_policy.version,'name',v_policy.name,'status',v_policy.status,'autonomy_tier',v_policy.autonomy_tier,'required_approval',v_policy.required_approval,'evaluation_id',v_eval.id,'result',v_eval.result,'reasons',v_eval.reasons,'decision',v_eval.decision)); end if; end if;
  v_proof_key:='finding:'||v_f.id::text||':evaluation:'||case when v_have_eval then v_eval.id::text else 'none' end;
  v_envelope:=jsonb_strip_nulls(jsonb_build_object('schema_version',1,'proof_type','watchdog.automation.proof','generated_at',now(),'property',jsonb_build_object('pams_pin',v_f.pams_pin),'event',jsonb_build_object('id',v_e.id,'type',v_e.event_type,'key',v_e.event_key,'occurred_at',v_e.occurred_at,'source',v_e.source),'intelligence',jsonb_build_object('finding_id',v_f.id,'run_id',v_f.run_id,'model_key',v_r.model_key,'model_version',v_r.model_version,'engine_version',v_r.engine_version,'opportunity_type',v_f.opportunity_type,'score',v_f.score,'confidence',v_f.confidence,'evidence_coverage',v_f.evidence_coverage,'facts_hash',v_f.facts_hash),'evidence',jsonb_build_object('count',v_count,'governed_available_count',v_governed,'governed_available_ratio',case when v_count>0 then round(100.0*v_governed/v_count,2) end,'oldest_observed_at',v_oldest,'newest_observed_at',v_newest,'refs',v_refs),'relationship',v_rel,'policy',v_pol,'authorization',jsonb_build_object('execution_allowed',false,'reason','proof_generation_only'),'delivery',jsonb_build_object('idempotency_key',v_e.id::text,'original_event_id',v_e.id)));
  insert into public.integration_automation_proofs(user_id,proof_key,event_id,finding_id,run_id,pams_pin,policy_id,policy_evaluation_id,facts_hash,envelope) values(v_user,v_proof_key,v_e.id,v_f.id,v_f.run_id,v_f.pams_pin,case when v_have_eval then v_policy.id end,case when v_have_eval then v_eval.id end,v_f.facts_hash,v_envelope) on conflict(proof_key) do update set envelope=excluded.envelope,facts_hash=excluded.facts_hash returning id into v_id;
  insert into public.integration_audit_log(user_id,connection_id,action,actor,details) values(v_user,null,'automation.proof.generated','user',jsonb_build_object('proof_id',v_id,'finding_id',v_f.id,'event_id',v_e.id,'policy_evaluation_id',case when v_have_eval then v_eval.id end));
  return jsonb_build_object('proof_id',v_id,'proof_key',v_proof_key,'event_id',v_e.id,'finding_id',v_f.id,'execution_allowed',false,'envelope',v_envelope);
end; $$;

revoke execute on function public.integration_save_shadow_policy(text,text,jsonb,jsonb,uuid,text,integer,text) from public, anon;
revoke execute on function public.integration_run_shadow_policy(uuid,integer) from public, anon;
revoke execute on function public.integration_create_finding_proof(uuid,uuid) from public, anon;
grant execute on function public.integration_save_shadow_policy(text,text,jsonb,jsonb,uuid,text,integer,text) to authenticated;
grant execute on function public.integration_run_shadow_policy(uuid,integer) to authenticated;
grant execute on function public.integration_create_finding_proof(uuid,uuid) to authenticated;
