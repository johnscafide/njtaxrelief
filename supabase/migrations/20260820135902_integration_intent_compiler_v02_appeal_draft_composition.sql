alter function public.integration_compile_automation_intent(text,jsonb) rename to integration_compile_automation_intent_v01;
revoke execute on function public.integration_compile_automation_intent_v01(text,jsonb) from public,anon,authenticated;

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
  v_compiler text:='intent-compiler-v0.2';
  v_contract text:='autonomy-v1';
  v_volume integer:=0;
  v_plan jsonb;
  v_constraints jsonb;
  v_id uuid;
  v_special boolean:=false;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if not public.integration_automation_entitled() then raise exception 'Intent compiler requires Pro+ or Teams' using errcode='42501'; end if;
  if length(v_obj)<12 then raise exception 'Describe the workflow objective in at least 12 characters' using errcode='23514'; end if;
  if jsonb_typeof(coalesce(p_untrusted_external_context,'{}'::jsonb))<>'object' or length(coalesce(p_untrusted_external_context,'{}'::jsonb)::text)>16000 then raise exception 'External context must be a small JSON object' using errcode='23514'; end if;

  v_lower:=lower(v_obj);
  v_special := v_lower ~ 'assessment'
    and v_lower ~ '(appeal|tax review|tax team|property tax)'
    and v_lower ~ '(client|customer)'
    and v_lower ~ '(email|message)'
    and v_lower ~ '(prepare|draft)'
    and v_lower ~ '(approve|approval|do not send|don''t send)';

  if not v_special then
    return public.integration_compile_automation_intent_v01(p_objective,p_untrusted_external_context);
  end if;

  v_intent_hash:=encode(extensions.digest(convert_to(v_obj,'UTF8'),'sha256'),'hex');
  if coalesce(p_untrusted_external_context,'{}'::jsonb)<>'{}'::jsonb then
    v_context_hash:=encode(extensions.digest(convert_to(p_untrusted_external_context::text,'UTF8'),'sha256'),'hex');
  end if;
  select count(*)::int into v_volume from public.integration_events e where e.user_id=v_user and e.event_type='property.signal.changed' and e.occurred_at>=now()-interval '30 days';

  v_constraints:=jsonb_build_array(
    'The client communication is draft-only in this proposed workflow.',
    'Sending the client message is not activated and would require a separate Tier 3 human-approved action tied to a current proof.',
    'Untrusted external context is never treated as instruction, permission, scope grant, or autonomy evidence.',
    'The compiler is suggestion-only and has no execution adapter.'
  );

  v_plan:=jsonb_build_object(
    'title','Assessment change → appeal review + client draft workflow',
    'trigger',jsonb_build_object('event_type','property.signal.changed','semantic_filter','assessment.material_change'),
    'policy',jsonb_build_object('require_verified_relationship',true,'min_evidence_coverage',75,'required_authority','governed','materiality_review_required',true),
    'watchdog_steps',jsonb_build_array(
      jsonb_build_object('action','get_property_snapshot','action_class','observe','tier',0),
      jsonb_build_object('action','run_intelligence_analysis','action_class','observe','tier',0),
      jsonb_build_object('action','summarize_governed_evidence','action_class','observe','tier',0),
      jsonb_build_object('action','prepare_client_email_draft','action_class','reversible_external_write','tier',2,'external_send',false)),
    'external_steps',jsonb_build_array(
      jsonb_build_object('action','create_crm_review_task','target','crm_via_zapier','action_class','reversible_external_write','tier',2,'reversible',true)),
    'future_approval_gate',jsonb_build_object('action','send_client_message','included_in_plan',false,'required_tier',3,'required_approval','human','proof_required',true),
    'required_capabilities',jsonb_build_array('property.read','intelligence.run','verified_relationship.read','crm.task.write','communications.draft'),
    'data_scopes',jsonb_build_array('saved_or_verified_properties','governed_property_evidence','verified_relationship_state'),
    'pii_implications',jsonb_build_array('Compiler stores no raw objective or external context.','Client contact destination is not needed to compile the plan.','A future send resolves the approved contact destination only after the verified relationship and approval gates pass.'),
    'retention','Store structured plan + hashes; do not store raw objective/context in compiler ledger.',
    'risk_class','medium','proposed_autonomy_tier',2,
    'estimated_volume',jsonb_build_object('historical_events_30d',v_volume,'estimate_basis','same Watchdog event type for this user; descriptive only','projected_external_actions_upper_bound_30d',v_volume),
    'shadow_handoff',jsonb_build_object('required',true,'policy_status','shadow','window_days',30,'external_execution',false,'measure',jsonb_build_array('events_considered','matched','skipped','projected_actions','outcomes_when_available')),
    'activation',jsonb_build_object('compiler_can_activate',false,'requires_separate_activation_path',true,'tier4_prompt_grant_allowed',false)
  );

  insert into public.integration_intent_compilations(user_id,compiler_version,autonomy_contract_version,intent_hash,external_context_hash,status,intent_key,risk_class,proposed_autonomy_tier,plan,questions,constraints)
  values(v_user,v_compiler,v_contract,v_intent_hash,v_context_hash,'proposed','appeal_review_with_client_draft','medium',2,v_plan,'[]'::jsonb,v_constraints)
  returning id into v_id;

  insert into public.integration_audit_log(user_id,connection_id,action,actor,details)
  values(v_user,null,'automation.intent_compiled','user',jsonb_build_object('compilation_id',v_id,'compiler_version',v_compiler,'intent_hash',v_intent_hash,'external_context_present',v_context_hash is not null,'status','proposed','intent_key','appeal_review_with_client_draft','risk_class','medium','proposed_autonomy_tier',2,'raw_objective_stored',false,'raw_external_context_stored',false,'activation_allowed',false,'composition_rule','appeal_plus_draft_client_communication'));

  return jsonb_build_object(
    'compilation_id',v_id,'compiler_version',v_compiler,'autonomy_contract_version',v_contract,
    'status','proposed','intent_key','appeal_review_with_client_draft','risk_class','medium','proposed_autonomy_tier',2,
    'plan',v_plan,'questions','[]'::jsonb,'constraints',v_constraints,
    'external_context',jsonb_build_object('present',v_context_hash is not null,'trusted',false,'used_for_authority',false,'stored_raw',false),
    'raw_objective_stored',false,'suggestion_only',true,'activation_allowed',false,'tier4_prompt_grant_allowed',false
  );
end;
$$;

revoke execute on function public.integration_compile_automation_intent(text,jsonb) from public,anon;
grant execute on function public.integration_compile_automation_intent(text,jsonb) to authenticated;
