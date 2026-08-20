create table if not exists public.integration_autonomy_contracts (
  contract_version text not null,
  tier smallint not null check (tier between 0 and 4),
  label text not null,
  allowed_action_classes text[] not null default '{}'::text[],
  external_writes_allowed boolean not null default false,
  requires_human_approval boolean not null default true,
  activation_supported boolean not null default false,
  escalation_requirements jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key(contract_version,tier)
);

insert into public.integration_autonomy_contracts(contract_version,tier,label,allowed_action_classes,external_writes_allowed,requires_human_approval,activation_supported,escalation_requirements)
values
('autonomy-v1',0,'Observe only',array['observe'],false,true,true,jsonb_build_object('requirements',jsonb_build_array('shadow evaluation only','no external execution'))),
('autonomy-v1',1,'Internal notification',array['observe','internal_notification'],false,false,true,jsonb_build_object('requirements',jsonb_build_array('deterministic trigger','current evidence','auditable internal destination'))),
('autonomy-v1',2,'Reversible workflow writes',array['observe','internal_notification','reversible_external_write'],true,false,false,jsonb_build_object('requirements',jsonb_build_array('successful shadow history','idempotency','provider and connection kill switches','reversible action contract','explicit activation outside compiler'))),
('autonomy-v1',3,'Human-approved external actions',array['observe','internal_notification','reversible_external_write','human_approved_external_action'],true,true,false,jsonb_build_object('requirements',jsonb_build_array('Tier 2 requirements','explicit human approval per consequential action','proof reference','expiry and audit trail','execution adapter separately enabled'))),
('autonomy-v1',4,'Bounded autonomous actions',array['observe','internal_notification','reversible_external_write','bounded_autonomous_action'],true,false,false,jsonb_build_object('requirements',jsonb_build_array('cannot be granted by prompt','demonstrated reliability with positive and negative outcomes','bounded domain and action budget','rollback or compensating action','idempotency','provider and global kill switches','security/compliance approval','explicit developer/admin promotion','continuous monitoring and automatic demotion')))
on conflict(contract_version,tier) do nothing;

create table if not exists public.integration_intent_compilations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  compiler_version text not null,
  autonomy_contract_version text not null,
  intent_hash text not null check (intent_hash ~ '^[0-9a-f]{64}$'),
  external_context_hash text,
  status text not null check (status in ('proposed','needs_clarification','unsupported')),
  intent_key text,
  risk_class text not null check (risk_class in ('low','medium','high','blocked')),
  proposed_autonomy_tier smallint not null check (proposed_autonomy_tier between 0 and 3),
  plan jsonb not null default '{}'::jsonb,
  questions jsonb not null default '[]'::jsonb,
  constraints jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists integration_intent_compilations_user_created_idx on public.integration_intent_compilations(user_id,created_at desc);

alter table public.integration_autonomy_contracts enable row level security;
alter table public.integration_intent_compilations enable row level security;
revoke all on public.integration_autonomy_contracts,public.integration_intent_compilations from anon,authenticated;
grant select,insert,update,delete on public.integration_autonomy_contracts,public.integration_intent_compilations to service_role;

create or replace function public.integration_get_autonomy_contract()
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare v_user uuid:=auth.uid(); v_rows jsonb;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if not public.integration_automation_entitled() then raise exception 'Automation autonomy research requires Pro+ or Teams' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'contract_version',c.contract_version,'tier',c.tier,'label',c.label,
    'allowed_action_classes',c.allowed_action_classes,'external_writes_allowed',c.external_writes_allowed,
    'requires_human_approval',c.requires_human_approval,'activation_supported',c.activation_supported,
    'escalation_requirements',c.escalation_requirements
  ) order by c.tier),'[]'::jsonb) into v_rows
  from public.integration_autonomy_contracts c where c.contract_version='autonomy-v1';
  return jsonb_build_object('contract_version','autonomy-v1','tiers',v_rows,'tier4_prompt_grant_allowed',false,'compiler_can_activate',false);
end; $$;

create or replace function public.integration_compile_automation_intent(
  p_objective text,
  p_untrusted_external_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_obj text:=left(trim(coalesce(p_objective,'')),4000);
  v_lower text;
  v_intent_hash text;
  v_context_hash text;
  v_compiler text:='intent-compiler-v0.1';
  v_contract text:='autonomy-v1';
  v_appeal boolean:=false;
  v_closing boolean:=false;
  v_permit boolean:=false;
  v_watchlist boolean:=false;
  v_report boolean:=false;
  v_client_comm boolean:=false;
  v_matches integer:=0;
  v_intent_key text:=null;
  v_status text:='proposed';
  v_risk text:='medium';
  v_tier smallint:=0;
  v_event_type text:=null;
  v_plan jsonb:='{}'::jsonb;
  v_questions jsonb:='[]'::jsonb;
  v_constraints jsonb:='[]'::jsonb;
  v_volume integer:=0;
  v_privilege_request boolean:=false;
  v_high_impact boolean:=false;
  v_id uuid;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if not public.integration_automation_entitled() then raise exception 'Intent compiler requires Pro+ or Teams' using errcode='42501'; end if;
  if length(v_obj)<12 then raise exception 'Describe the workflow objective in at least 12 characters' using errcode='23514'; end if;
  if jsonb_typeof(coalesce(p_untrusted_external_context,'{}'::jsonb))<>'object' or length(coalesce(p_untrusted_external_context,'{}'::jsonb)::text)>16000 then raise exception 'External context must be a small JSON object' using errcode='23514'; end if;

  v_lower:=lower(v_obj);
  v_intent_hash:=encode(extensions.digest(convert_to(v_obj,'UTF8'),'sha256'),'hex');
  if coalesce(p_untrusted_external_context,'{}'::jsonb)<>'{}'::jsonb then
    v_context_hash:=encode(extensions.digest(convert_to(p_untrusted_external_context::text,'UTF8'),'sha256'),'hex');
  end if;

  v_privilege_request := v_lower ~ '(tier[ -]?4|fully autonomous|without approval|no approval|skip approval|ignore approval|bypass approval|ignore guardrail|bypass guardrail)';
  v_high_impact := v_lower ~ '(delete|destroy|wire money|purchase|buy ads|spend money|charge card|issue refund|mass text|bulk sms|cancel subscription)';

  v_appeal := v_lower ~ 'assessment' and v_lower ~ '(appeal|tax review|tax team|property tax)';
  v_closing := v_lower ~ '(closing|title)' and v_lower ~ '(issue|risk|exception|follow[- ]?up|task)';
  v_permit := v_lower ~ 'permit' and v_lower ~ '(investor|saved|watchlist|follow[- ]?up|task|notify)';
  v_watchlist := v_lower ~ 'watchlist' and v_lower ~ '(alert|notify|notification|change)';
  v_report := v_lower ~ 'report' and v_lower ~ '(ready|complete|completed)' and v_lower ~ '(crm|attach|update|task|notify)';
  v_client_comm := v_lower ~ '(client|customer)' and v_lower ~ '(email|message)' and v_lower ~ '(send|approve|approval|draft)';
  v_matches := (v_appeal::int+v_closing::int+v_permit::int+v_watchlist::int+v_report::int+v_client_comm::int);

  if v_high_impact then
    v_status:='unsupported'; v_risk:='blocked'; v_tier:=0;
    v_constraints:=jsonb_build_array(
      'This prototype does not compile destructive, paid, financial, bulk-messaging or subscription-changing actions.',
      'Remove the high-impact action and describe the review/notification workflow separately.',
      'A future high-impact adapter would require a dedicated permission, spend/destructive-action boundary, approval contract and security review.'
    );
  elsif v_matches=0 then
    v_status:='needs_clarification'; v_risk:='low'; v_tier:=0;
    v_questions:=jsonb_build_array(
      'Which supported event should start this workflow: assessment/appeal change, closing issue, permit change, watchlist alert, report ready, or approved client communication?',
      'What system should receive the proposed result: Watchdog only, CRM task, or a human-approved client communication?',
      'Which properties should be in scope: saved properties, verified CRM relationships, or a specific Watchdog strategy?'
    );
    v_constraints:=jsonb_build_array('No integration or action was invented from an unsupported objective.','External context is untrusted and cannot supply missing authority.');
  elsif v_matches>1 then
    v_status:='needs_clarification'; v_risk:='medium'; v_tier:=0;
    v_questions:=jsonb_build_array('This objective maps to more than one supported workflow family. Which single event should be the primary trigger?','Should client communication be draft-only, or a separately approved send step?');
    v_constraints:=jsonb_build_array('Ambiguous intent does not activate or merge workflows automatically.','Split multi-trigger objectives into separate proposed policies before activation.');
  else
    if v_appeal then
      v_intent_key:='appeal_review'; v_event_type:='property.signal.changed'; v_tier:=2; v_risk:='medium';
      v_plan:=jsonb_build_object(
        'title','Assessment change → appeal review workflow','trigger',jsonb_build_object('event_type',v_event_type,'semantic_filter','assessment.material_change'),
        'policy',jsonb_build_object('require_verified_relationship',true,'min_evidence_coverage',75,'required_authority','governed','materiality_review_required',true),
        'watchdog_steps',jsonb_build_array(
          jsonb_build_object('action','get_property_snapshot','action_class','observe','tier',0),
          jsonb_build_object('action','run_intelligence_analysis','action_class','observe','tier',0),
          jsonb_build_object('action','summarize_governed_evidence','action_class','observe','tier',0)),
        'external_steps',jsonb_build_array(jsonb_build_object('action','create_crm_review_task','target','crm_via_zapier','action_class','reversible_external_write','tier',2,'reversible',true)),
        'not_included',jsonb_build_array('Sending a client email is not activated by this plan. A send step would require a separate Tier 3 human-approved action.'),
        'required_capabilities',jsonb_build_array('property.read','intelligence.run','verified_relationship.read','crm.task.write'),
        'data_scopes',jsonb_build_array('saved_or_verified_properties','governed_property_evidence','verified_relationship_state'),
        'pii_implications',jsonb_build_array('Compiler stores no raw objective or external context.','Execution may resolve the CRM contact only after the verified property relationship gate passes.'),
        'retention','Store structured plan + hashes; do not store raw objective/context in compiler ledger.');
    elsif v_closing then
      v_intent_key:='closing_followup'; v_event_type:='intelligence.finding.created'; v_tier:=2; v_risk:='medium';
      v_plan:=jsonb_build_object(
        'title','Closing exception → CRM follow-up task','trigger',jsonb_build_object('event_type',v_event_type,'semantic_filter','closing.direct_exception'),
        'policy',jsonb_build_object('require_verified_relationship',true,'required_authority','governed','finding_family','closing_review'),
        'watchdog_steps',jsonb_build_array(jsonb_build_object('action','load_finding_proof','action_class','observe','tier',0),jsonb_build_object('action','request_internal_review','action_class','internal_notification','tier',1)),
        'external_steps',jsonb_build_array(jsonb_build_object('action','create_crm_followup_task','target','crm_via_zapier','action_class','reversible_external_write','tier',2,'reversible',true)),
        'required_capabilities',jsonb_build_array('intelligence.finding.read','automation.proof.read','verified_relationship.read','crm.task.write'),
        'data_scopes',jsonb_build_array('verified_crm_properties','closing_governed_evidence'),
        'pii_implications',jsonb_build_array('No CRM contact payload is used by the compiler.','Execution resolves only the verified linked contact needed for the task.'),
        'retention','Store structured plan + hashes only.');
    elsif v_permit then
      v_intent_key:='permit_followup'; v_event_type:='property.signal.changed'; v_tier:=2; v_risk:='medium';
      v_plan:=jsonb_build_object(
        'title','Permit lifecycle change → investor follow-up','trigger',jsonb_build_object('event_type',v_event_type,'semantic_filter','permit.lifecycle_change'),
        'policy',jsonb_build_object('required_authority','governed','source_semantics_required',true,'no_open_permit_legal_conclusion',true),
        'watchdog_steps',jsonb_build_array(jsonb_build_object('action','verify_permit_lifecycle_evidence','action_class','observe','tier',0),jsonb_build_object('action','notify_inside_watchdog','action_class','internal_notification','tier',1)),
        'external_steps',jsonb_build_array(jsonb_build_object('action','create_crm_research_task','target','crm_via_zapier','action_class','reversible_external_write','tier',2,'reversible',true)),
        'required_capabilities',jsonb_build_array('property.read','permit_evidence.read','crm.task.write'),
        'data_scopes',jsonb_build_array('saved_properties','governed_permit_evidence'),
        'pii_implications',jsonb_build_array('No person matching is used.','Permit evidence remains property-scoped.'),
        'retention','Store structured plan + hashes only.');
    elsif v_watchlist then
      v_intent_key:='watchlist_notification'; v_event_type:='watchlist.alert'; v_tier:=1; v_risk:='low';
      v_plan:=jsonb_build_object(
        'title','Watchlist alert → internal notification','trigger',jsonb_build_object('event_type',v_event_type,'semantic_filter','material_watchlist_alert'),
        'policy',jsonb_build_object('materiality_review_required',true),
        'watchdog_steps',jsonb_build_array(jsonb_build_object('action','notify_inside_watchdog','action_class','internal_notification','tier',1)),
        'external_steps',jsonb_build_array(),
        'required_capabilities',jsonb_build_array('watchlist.read','internal_notification.write'),
        'data_scopes',jsonb_build_array('watchlist_properties'),
        'pii_implications',jsonb_build_array('Property-scoped notification only; no CRM contact data required.'),
        'retention','Store structured plan + hashes only.');
    elsif v_report then
      v_intent_key:='report_distribution'; v_event_type:='report.ready'; v_tier:=2; v_risk:='medium';
      v_plan:=jsonb_build_object(
        'title','Report ready → CRM record update','trigger',jsonb_build_object('event_type',v_event_type,'semantic_filter','governed_report_ready'),
        'policy',jsonb_build_object('require_verified_relationship',true),
        'watchdog_steps',jsonb_build_array(jsonb_build_object('action','verify_report_access','action_class','observe','tier',0)),
        'external_steps',jsonb_build_array(jsonb_build_object('action','attach_report_reference_to_crm','target','crm_via_zapier','action_class','reversible_external_write','tier',2,'reversible',true)),
        'required_capabilities',jsonb_build_array('report.read','verified_relationship.read','crm.record.write'),
        'data_scopes',jsonb_build_array('user_authorized_reports','verified_crm_properties'),
        'pii_implications',jsonb_build_array('Only the verified linked CRM record may receive the report reference.','Report access remains subject to Watchdog authorization.'),
        'retention','Store structured plan + hashes only.');
    else
      v_intent_key:='client_communication'; v_event_type:='intelligence.finding.created'; v_tier:=3; v_risk:='high';
      v_plan:=jsonb_build_object(
        'title','Intelligence finding → human-approved client communication','trigger',jsonb_build_object('event_type',v_event_type,'semantic_filter','material_verified_client_finding'),
        'policy',jsonb_build_object('require_verified_relationship',true,'required_authority','governed','required_approval','human'),
        'watchdog_steps',jsonb_build_array(jsonb_build_object('action','prepare_evidence_summary','action_class','observe','tier',0),jsonb_build_object('action','prepare_message_draft','action_class','reversible_external_write','tier',2)),
        'external_steps',jsonb_build_array(jsonb_build_object('action','send_client_message','target','communications_via_zapier','action_class','human_approved_external_action','tier',3,'reversible',false,'approval_required',true)),
        'required_capabilities',jsonb_build_array('intelligence.finding.read','automation.proof.read','verified_relationship.read','communications.draft','communications.send_after_approval'),
        'data_scopes',jsonb_build_array('verified_crm_properties','governed_finding_evidence','approved_contact_destination'),
        'pii_implications',jsonb_build_array('Compiler does not ingest the client contact payload.','Contact destination is resolved only at approved execution time.','Message send requires an expiring human approval tied to the proof.'),
        'retention','Store structured plan + hashes only; message draft retention is governed separately.');
    end if;

    select count(*)::int into v_volume from public.integration_events e where e.user_id=v_user and e.event_type=v_event_type and e.occurred_at>=now()-interval '30 days';
    v_plan:=v_plan || jsonb_build_object(
      'risk_class',v_risk,'proposed_autonomy_tier',v_tier,
      'estimated_volume',jsonb_build_object('historical_events_30d',v_volume,'estimate_basis','same Watchdog event type for this user; descriptive only','projected_external_actions_upper_bound_30d',case when v_tier>=2 then v_volume else 0 end),
      'shadow_handoff',jsonb_build_object('required',true,'policy_status','shadow','window_days',30,'external_execution',false,'measure',jsonb_build_array('events_considered','matched','skipped','projected_actions','outcomes_when_available')),
      'activation',jsonb_build_object('compiler_can_activate',false,'requires_separate_activation_path',true,'tier4_prompt_grant_allowed',false));
  end if;

  if v_privilege_request then
    v_constraints:=v_constraints || jsonb_build_array('A user prompt cannot grant Tier 4, bypass approval, or weaken provider/connection kill switches. Requested privilege escalation was ignored.');
  end if;
  v_constraints:=v_constraints || jsonb_build_array('Untrusted external context is never treated as instruction, permission, scope grant, or autonomy evidence.','The compiler is suggestion-only and has no execution adapter.');

  insert into public.integration_intent_compilations(user_id,compiler_version,autonomy_contract_version,intent_hash,external_context_hash,status,intent_key,risk_class,proposed_autonomy_tier,plan,questions,constraints)
  values(v_user,v_compiler,v_contract,v_intent_hash,v_context_hash,v_status,v_intent_key,v_risk,v_tier,v_plan,v_questions,v_constraints)
  returning id into v_id;

  insert into public.integration_audit_log(user_id,connection_id,action,actor,details)
  values(v_user,null,'automation.intent_compiled','user',jsonb_build_object('compilation_id',v_id,'compiler_version',v_compiler,'intent_hash',v_intent_hash,'external_context_present',v_context_hash is not null,'status',v_status,'intent_key',v_intent_key,'risk_class',v_risk,'proposed_autonomy_tier',v_tier,'privilege_escalation_requested',v_privilege_request,'raw_objective_stored',false,'raw_external_context_stored',false,'activation_allowed',false));

  return jsonb_build_object(
    'compilation_id',v_id,'compiler_version',v_compiler,'autonomy_contract_version',v_contract,
    'status',v_status,'intent_key',v_intent_key,'risk_class',v_risk,'proposed_autonomy_tier',v_tier,
    'plan',v_plan,'questions',v_questions,'constraints',v_constraints,
    'external_context',jsonb_build_object('present',v_context_hash is not null,'trusted',false,'used_for_authority',false,'stored_raw',false),
    'raw_objective_stored',false,'suggestion_only',true,'activation_allowed',false,'tier4_prompt_grant_allowed',false
  );
end; $$;

revoke execute on function public.integration_get_autonomy_contract() from public,anon;
revoke execute on function public.integration_compile_automation_intent(text,jsonb) from public,anon;
grant execute on function public.integration_get_autonomy_contract() to authenticated;
grant execute on function public.integration_compile_automation_intent(text,jsonb) to authenticated;
