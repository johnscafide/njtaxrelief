create table if not exists public.integration_automation_approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  approval_key text not null unique,
  policy_id uuid references public.integration_automation_policies(id) on delete set null,
  policy_evaluation_id uuid references public.integration_policy_evaluations(id) on delete set null,
  shadow_action_id uuid references public.integration_shadow_actions(id) on delete set null,
  proof_id uuid references public.integration_automation_proofs(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','canceled','expired')),
  requested_action jsonb not null default '{}'::jsonb,
  approval_context jsonb not null default '{}'::jsonb,
  execution_allowed boolean not null default false check (execution_allowed = false),
  requested_at timestamptz not null default now(),
  expires_at timestamptz,
  decided_at timestamptz,
  decided_by_user_id uuid references auth.users(id) on delete set null,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.integration_automation_approvals enable row level security;
revoke all on public.integration_automation_approvals from anon, authenticated;
create index if not exists integration_automation_approvals_user_status_idx on public.integration_automation_approvals(user_id,status,requested_at desc);
create index if not exists integration_automation_approvals_policy_idx on public.integration_automation_approvals(policy_id) where policy_id is not null;
create index if not exists integration_automation_approvals_evaluation_idx on public.integration_automation_approvals(policy_evaluation_id) where policy_evaluation_id is not null;
create index if not exists integration_automation_approvals_shadow_action_idx on public.integration_automation_approvals(shadow_action_id) where shadow_action_id is not null;
create index if not exists integration_automation_approvals_proof_idx on public.integration_automation_approvals(proof_id) where proof_id is not null;
create index if not exists integration_automation_approvals_decider_idx on public.integration_automation_approvals(decided_by_user_id) where decided_by_user_id is not null;

create or replace function public.integration_automation_entitled()
returns boolean language sql stable security definer set search_path=public,private,pg_temp as $$
  select auth.uid() is not null and (
    exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_role='developer')
    or exists(select 1 from public.account_entitlements e where e.user_id=auth.uid() and e.plan_tier in ('pro_plus','teams','developer') and e.subscription_status in ('active','trialing','past_due','cancel_scheduled'))
  );
$$;
revoke execute on function public.integration_automation_entitled() from public,anon;
grant execute on function public.integration_automation_entitled() to authenticated;

create or replace function public.integration_list_automation_proofs(p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_user uuid:=auth.uid(); v_limit integer:=greatest(1,least(coalesce(p_limit,20),50)); v_rows jsonb;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if not public.integration_automation_entitled() then raise exception 'Automation proofs require Pro+ or Teams' using errcode='42501'; end if;
  select coalesce(jsonb_agg(x order by x.created_at desc),'[]'::jsonb) into v_rows from (
    select p.id,p.created_at,p.pams_pin,p.finding_id,p.event_id,p.policy_id,p.policy_evaluation_id,p.proof_key,
      f.property_address,f.opportunity_type,f.score,f.confidence,f.evidence_coverage,
      coalesce((p.envelope#>>'{evidence,count}')::int,0) as evidence_count,
      nullif(p.envelope#>>'{evidence,governed_available_ratio}','')::numeric as governed_ratio,
      coalesce(p.envelope#>>'{relationship,status}','') as relationship_status,
      coalesce(p.envelope#>>'{policy,status}','') as policy_status,
      coalesce((select count(*) from public.intelligence_outcome_events oe where oe.user_id=v_user and oe.finding_id=p.finding_id and oe.occurred_at>=coalesce((p.envelope#>>'{event,occurred_at}')::timestamptz,p.created_at)),0)::int as outcome_count
    from public.integration_automation_proofs p
    left join public.intelligence_findings f on f.id=p.finding_id and f.user_id=v_user
    where p.user_id=v_user
    order by p.created_at desc limit v_limit
  ) x;
  return jsonb_build_object('proofs',v_rows,'count',jsonb_array_length(v_rows),'execution_allowed',false);
end; $$;

create or replace function public.integration_get_automation_proof(p_proof_id uuid)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_user uuid:=auth.uid(); v_p public.integration_automation_proofs%rowtype; v_f public.intelligence_findings%rowtype; v_outcomes jsonb; v_approvals jsonb;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if not public.integration_automation_entitled() then raise exception 'Automation proofs require Pro+ or Teams' using errcode='42501'; end if;
  select * into v_p from public.integration_automation_proofs where id=p_proof_id and user_id=v_user;
  if not found then raise exception 'Proof not found' using errcode='P0002'; end if;
  select * into v_f from public.intelligence_findings where id=v_p.finding_id and user_id=v_user;
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',o.id,'event_type',o.event_type,'reason_code',o.reason_code,'revenue_cents',o.revenue_cents,'artifact_type',o.artifact_type,'artifact_id',o.artifact_id,'occurred_at',o.occurred_at)) order by o.occurred_at),'[]'::jsonb) into v_outcomes
    from public.intelligence_outcome_events o where o.user_id=v_user and o.finding_id=v_p.finding_id and o.occurred_at>=coalesce((v_p.envelope#>>'{event,occurred_at}')::timestamptz,v_p.created_at);
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',a.id,'status',a.status,'requested_at',a.requested_at,'expires_at',a.expires_at,'decided_at',a.decided_at,'decision_note',a.decision_note,'execution_allowed',a.execution_allowed)) order by a.requested_at desc),'[]'::jsonb) into v_approvals
    from public.integration_automation_approvals a where a.user_id=v_user and a.proof_id=v_p.id;
  return jsonb_build_object('proof',jsonb_build_object('id',v_p.id,'proof_key',v_p.proof_key,'created_at',v_p.created_at,'envelope',v_p.envelope),'finding',jsonb_strip_nulls(jsonb_build_object('id',v_f.id,'property_address',v_f.property_address,'opportunity_type',v_f.opportunity_type,'score',v_f.score,'confidence',v_f.confidence,'evidence_coverage',v_f.evidence_coverage,'narrative_status',v_f.narrative_status)),'outcomes',v_outcomes,'approvals',v_approvals,'execution_allowed',false);
end; $$;

create or replace function public.integration_list_shadow_decisions(p_limit integer default 30)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_user uuid:=auth.uid(); v_limit integer:=greatest(1,least(coalesce(p_limit,30),100)); v_rows jsonb;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if not public.integration_automation_entitled() then raise exception 'Automation review requires Pro+ or Teams' using errcode='42501'; end if;
  select coalesce(jsonb_agg(x order by x.created_at desc),'[]'::jsonb) into v_rows from (
    select sa.id as shadow_action_id,sa.created_at,sa.action_type,sa.target_system,sa.would_write_external,sa.blocked_reason,
      pe.id as evaluation_id,pe.event_id,pe.result,pe.reasons,pe.decision,
      ap.id as policy_id,ap.name as policy_name,ap.version as policy_version,ap.autonomy_tier,ap.required_approval,
      f.id as finding_id,f.pams_pin,f.property_address,f.opportunity_type,f.score,f.confidence,f.evidence_coverage,
      pr.id as proof_id,aa.id as approval_id,aa.status as approval_status,aa.execution_allowed as approval_execution_allowed,
      coalesce((select count(*) from public.intelligence_outcome_events oe where oe.user_id=v_user and oe.finding_id=f.id and oe.occurred_at>=ie.occurred_at),0)::int as outcome_count
    from public.integration_shadow_actions sa
    join public.integration_policy_evaluations pe on pe.id=sa.evaluation_id and pe.user_id=v_user
    join public.integration_automation_policies ap on ap.id=pe.policy_id and ap.user_id=v_user
    join public.integration_events ie on ie.id=pe.event_id and ie.user_id=v_user
    left join public.intelligence_findings f on f.user_id=v_user and f.id=case when (pe.decision->>'finding_id') ~* '^[0-9a-f-]{36}$' then (pe.decision->>'finding_id')::uuid else null end
    left join public.integration_automation_proofs pr on pr.user_id=v_user and pr.policy_evaluation_id=pe.id
    left join public.integration_automation_approvals aa on aa.user_id=v_user and aa.shadow_action_id=sa.id
    where sa.user_id=v_user and pe.result='matched'
    order by sa.created_at desc limit v_limit
  ) x;
  return jsonb_build_object('decisions',v_rows,'count',jsonb_array_length(v_rows),'execution_allowed',false);
end; $$;

create or replace function public.integration_shadow_outcome_comparison(p_shadow_run_id uuid)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_user uuid:=auth.uid(); v_run public.integration_shadow_runs%rowtype; v_matched int:=0; v_with_outcomes int:=0; v_outcomes int:=0; v_types jsonb; v_rows jsonb;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if not public.integration_automation_entitled() then raise exception 'Outcome comparison requires Pro+ or Teams' using errcode='42501'; end if;
  select * into v_run from public.integration_shadow_runs where id=p_shadow_run_id and user_id=v_user;
  if not found then raise exception 'Shadow run not found' using errcode='P0002'; end if;
  select count(*)::int into v_matched from public.integration_policy_evaluations pe where pe.shadow_run_id=v_run.id and pe.user_id=v_user and pe.result='matched';
  with matched as (
    select pe.id evaluation_id,ie.occurred_at,case when (pe.decision->>'finding_id') ~* '^[0-9a-f-]{36}$' then (pe.decision->>'finding_id')::uuid else null end finding_id
    from public.integration_policy_evaluations pe join public.integration_events ie on ie.id=pe.event_id and ie.user_id=v_user
    where pe.shadow_run_id=v_run.id and pe.user_id=v_user and pe.result='matched'
  ), oc as (
    select m.evaluation_id,o.id,o.event_type,o.reason_code,o.occurred_at from matched m join public.intelligence_outcome_events o on o.user_id=v_user and o.finding_id=m.finding_id and o.occurred_at>=m.occurred_at
  )
  select count(distinct evaluation_id)::int,count(*)::int,coalesce(jsonb_object_agg(event_type,cnt),'{}'::jsonb) into v_with_outcomes,v_outcomes,v_types from (select evaluation_id,event_type,count(*) over(partition by event_type)::int cnt from oc) q;
  with matched as (
    select pe.id evaluation_id,pe.decision,ie.occurred_at,case when (pe.decision->>'finding_id') ~* '^[0-9a-f-]{36}$' then (pe.decision->>'finding_id')::uuid else null end finding_id
    from public.integration_policy_evaluations pe join public.integration_events ie on ie.id=pe.event_id and ie.user_id=v_user
    where pe.shadow_run_id=v_run.id and pe.user_id=v_user and pe.result='matched'
  ) select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('evaluation_id',m.evaluation_id,'finding_id',m.finding_id,'property_address',f.property_address,'opportunity_type',f.opportunity_type,'decision',m.decision,'outcome_count',(select count(*) from public.intelligence_outcome_events o where o.user_id=v_user and o.finding_id=m.finding_id and o.occurred_at>=m.occurred_at))) order by m.occurred_at desc),'[]'::jsonb) into v_rows from matched m left join public.intelligence_findings f on f.id=m.finding_id and f.user_id=v_user;
  return jsonb_build_object('shadow_run_id',v_run.id,'matched',v_matched,'matched_with_outcomes',v_with_outcomes,'matched_without_outcomes',greatest(v_matched-v_with_outcomes,0),'outcome_events',v_outcomes,'outcome_event_types',coalesce(v_types,'{}'::jsonb),'telemetry_available',v_outcomes>0,'rows',v_rows,'execution_allowed',false,'message',case when v_outcomes=0 then 'No persisted Intelligence outcome telemetry is available for these matched findings yet.' else 'Observed outcome telemetry is descriptive and does not by itself label the policy successful or unsuccessful.' end);
end; $$;

create or replace function public.integration_request_automation_approval(p_shadow_action_id uuid,p_expires_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_user uuid:=auth.uid(); v_sa public.integration_shadow_actions%rowtype; v_pe public.integration_policy_evaluations%rowtype; v_ap public.integration_automation_policies%rowtype; v_finding uuid; v_proof uuid; v_proof_result jsonb; v_id uuid; v_exp timestamptz;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if not public.integration_automation_entitled() then raise exception 'Automation approvals require Pro+ or Teams' using errcode='42501'; end if;
  select * into v_sa from public.integration_shadow_actions where id=p_shadow_action_id and user_id=v_user;
  if not found then raise exception 'Shadow action not found' using errcode='P0002'; end if;
  select * into v_pe from public.integration_policy_evaluations where id=v_sa.evaluation_id and user_id=v_user;
  if not found or v_pe.result<>'matched' then raise exception 'Only a matched shadow decision can request approval' using errcode='23514'; end if;
  select * into v_ap from public.integration_automation_policies where id=v_pe.policy_id and user_id=v_user;
  if not found or v_ap.status<>'shadow' then raise exception 'Approval requests require a shadow policy' using errcode='23514'; end if;
  begin v_finding:=nullif(v_pe.decision->>'finding_id','')::uuid; exception when others then v_finding:=null; end;
  if v_finding is null then raise exception 'Matched decision has no governed Intelligence finding' using errcode='23514'; end if;
  select id into v_proof from public.integration_automation_proofs where user_id=v_user and policy_evaluation_id=v_pe.id order by created_at desc limit 1;
  if v_proof is null then
    v_proof_result:=public.integration_create_finding_proof(v_finding,v_pe.id);
    v_proof:=(v_proof_result->>'proof_id')::uuid;
  end if;
  v_exp:=least(coalesce(p_expires_at,now()+interval '72 hours'),now()+interval '14 days');
  insert into public.integration_automation_approvals(user_id,approval_key,policy_id,policy_evaluation_id,shadow_action_id,proof_id,status,requested_action,approval_context,execution_allowed,expires_at)
  values(v_user,'shadow-action:'||v_sa.id::text,v_ap.id,v_pe.id,v_sa.id,v_proof,'pending',jsonb_build_object('action_type',v_sa.action_type,'target_system',v_sa.target_system,'would_write_external',v_sa.would_write_external,'projected_payload',v_sa.projected_payload,'shadow_blocked_reason',v_sa.blocked_reason),jsonb_build_object('policy_name',v_ap.name,'policy_version',v_ap.version,'autonomy_tier',v_ap.autonomy_tier,'required_approval',v_ap.required_approval,'evaluation_result',v_pe.result,'evaluation_reasons',v_pe.reasons,'proof_id',v_proof),false,v_exp)
  on conflict(approval_key) do update set updated_at=now() returning id into v_id;
  insert into public.integration_audit_log(user_id,connection_id,action,actor,details) values(v_user,null,'automation.approval.requested','user',jsonb_build_object('approval_id',v_id,'shadow_action_id',v_sa.id,'policy_evaluation_id',v_pe.id,'proof_id',v_proof,'execution_allowed',false));
  return jsonb_build_object('approval_id',v_id,'status','pending','proof_id',v_proof,'execution_allowed',false,'message','Human review requested. Approval records do not execute automation in this phase.');
end; $$;

create or replace function public.integration_list_automation_approvals(p_limit integer default 30)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_user uuid:=auth.uid(); v_limit int:=greatest(1,least(coalesce(p_limit,30),100)); v_rows jsonb;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if not public.integration_automation_entitled() then raise exception 'Automation approvals require Pro+ or Teams' using errcode='42501'; end if;
  update public.integration_automation_approvals set status='expired',updated_at=now() where user_id=v_user and status='pending' and expires_at is not null and expires_at<=now();
  select coalesce(jsonb_agg(x order by x.requested_at desc),'[]'::jsonb) into v_rows from (
    select a.id,a.status,a.requested_at,a.expires_at,a.decided_at,a.decision_note,a.execution_allowed,a.requested_action,a.approval_context,a.proof_id,a.shadow_action_id,a.policy_evaluation_id,a.policy_id,
      p.name policy_name,p.version policy_version,
      f.property_address,f.opportunity_type,f.score,f.confidence
    from public.integration_automation_approvals a
    left join public.integration_automation_policies p on p.id=a.policy_id and p.user_id=v_user
    left join public.integration_policy_evaluations pe on pe.id=a.policy_evaluation_id and pe.user_id=v_user
    left join public.intelligence_findings f on f.id=case when (pe.decision->>'finding_id') ~* '^[0-9a-f-]{36}$' then (pe.decision->>'finding_id')::uuid else null end and f.user_id=v_user
    where a.user_id=v_user order by a.requested_at desc limit v_limit
  ) x;
  return jsonb_build_object('approvals',v_rows,'count',jsonb_array_length(v_rows),'execution_allowed',false);
end; $$;

create or replace function public.integration_decide_automation_approval(p_approval_id uuid,p_decision text,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_user uuid:=auth.uid(); v_a public.integration_automation_approvals%rowtype; v_status text:=lower(trim(coalesce(p_decision,'')));
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if not public.integration_automation_entitled() then raise exception 'Automation approvals require Pro+ or Teams' using errcode='42501'; end if;
  if v_status not in ('approved','rejected') then raise exception 'Decision must be approved or rejected' using errcode='23514'; end if;
  select * into v_a from public.integration_automation_approvals where id=p_approval_id and user_id=v_user for update;
  if not found then raise exception 'Approval not found' using errcode='P0002'; end if;
  if v_a.status<>'pending' then raise exception 'Approval is no longer pending' using errcode='23514'; end if;
  if v_a.expires_at is not null and v_a.expires_at<=now() then update public.integration_automation_approvals set status='expired',updated_at=now() where id=v_a.id; raise exception 'Approval expired' using errcode='23514'; end if;
  update public.integration_automation_approvals set status=v_status,decided_at=now(),decided_by_user_id=v_user,decision_note=nullif(left(trim(coalesce(p_note,'')),1000),''),execution_allowed=false,updated_at=now() where id=v_a.id;
  insert into public.integration_audit_log(user_id,connection_id,action,actor,details) values(v_user,null,'automation.approval.'||v_status,'user',jsonb_build_object('approval_id',v_a.id,'policy_id',v_a.policy_id,'shadow_action_id',v_a.shadow_action_id,'proof_id',v_a.proof_id,'execution_allowed',false));
  return jsonb_build_object('approval_id',v_a.id,'status',v_status,'execution_allowed',false,'message','Decision recorded. External execution remains disabled in this phase.');
end; $$;

revoke execute on function public.integration_list_automation_proofs(integer) from public,anon;
revoke execute on function public.integration_get_automation_proof(uuid) from public,anon;
revoke execute on function public.integration_list_shadow_decisions(integer) from public,anon;
revoke execute on function public.integration_shadow_outcome_comparison(uuid) from public,anon;
revoke execute on function public.integration_request_automation_approval(uuid,timestamptz) from public,anon;
revoke execute on function public.integration_list_automation_approvals(integer) from public,anon;
revoke execute on function public.integration_decide_automation_approval(uuid,text,text) from public,anon;
grant execute on function public.integration_list_automation_proofs(integer) to authenticated;
grant execute on function public.integration_get_automation_proof(uuid) to authenticated;
grant execute on function public.integration_list_shadow_decisions(integer) to authenticated;
grant execute on function public.integration_shadow_outcome_comparison(uuid) to authenticated;
grant execute on function public.integration_request_automation_approval(uuid,timestamptz) to authenticated;
grant execute on function public.integration_list_automation_approvals(integer) to authenticated;
grant execute on function public.integration_decide_automation_approval(uuid,text,text) to authenticated;