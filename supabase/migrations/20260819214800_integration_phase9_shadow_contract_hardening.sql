create or replace function private.integration_validate_shadow_policy_row()
returns trigger
language plpgsql
set search_path=public,private,pg_temp
as $$
declare
  v_actions jsonb;
  v_action jsonb;
begin
  if jsonb_typeof(new.conditions)<>'object' or length(new.conditions::text)>16000 then
    raise exception 'Invalid conditions contract' using errcode='23514';
  end if;
  if jsonb_typeof(new.action_plan)<>'object' or length(new.action_plan::text)>24000 then
    raise exception 'Invalid action plan contract' using errcode='23514';
  end if;
  v_actions:=coalesce(new.action_plan->'actions','[]'::jsonb);
  if jsonb_typeof(v_actions)<>'array' or jsonb_array_length(v_actions)>10 then
    raise exception 'Action plan supports at most 10 shadow actions' using errcode='23514';
  end if;
  for v_action in select value from jsonb_array_elements(v_actions) loop
    if jsonb_typeof(v_action)<>'object' then
      raise exception 'Every shadow action must be an object' using errcode='23514';
    end if;
    if nullif(trim(coalesce(v_action->>'type','')),'') is null or char_length(v_action->>'type')>100 then
      raise exception 'Every shadow action requires a valid type' using errcode='23514';
    end if;
    if v_action ? 'external_write' and jsonb_typeof(v_action->'external_write')<>'boolean' then
      raise exception 'external_write must be a boolean' using errcode='23514';
    end if;
    if v_action ? 'target_system' and (jsonb_typeof(v_action->'target_system')<>'string' or char_length(v_action->>'target_system')>100) then
      raise exception 'target_system must be a short string' using errcode='23514';
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function private.integration_validate_shadow_policy_row() from public,anon,authenticated;
drop trigger if exists integration_validate_shadow_policy on public.integration_automation_policies;
create trigger integration_validate_shadow_policy
before insert or update of conditions,action_plan on public.integration_automation_policies
for each row execute function private.integration_validate_shadow_policy_row();

create or replace function public.integration_run_shadow_policy(p_policy_id uuid,p_window_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_user uuid:=auth.uid(); v_allowed boolean:=false; v_policy public.integration_automation_policies%rowtype; v_run uuid:=gen_random_uuid();
  v_days integer:=greatest(1,least(coalesce(p_window_days,30),90)); v_event public.integration_events%rowtype; v_eval uuid; v_action jsonb;
  v_considered integer:=0; v_matched integer:=0; v_skipped integer:=0; v_projected integer:=0; v_result text; v_reasons text[]; v_score numeric; v_conf numeric; v_severity text; v_threshold numeric; v_external boolean;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select exists(select 1 from public.profiles p where p.id=v_user and p.account_role='developer') or exists(select 1 from public.account_entitlements e where e.user_id=v_user and e.plan_tier in ('pro_plus','teams','developer') and e.subscription_status in ('active','trialing','past_due','cancel_scheduled')) into v_allowed;
  if not v_allowed then raise exception 'Shadow automation policies require Pro+ or Teams' using errcode='42501'; end if;
  select * into v_policy from public.integration_automation_policies where id=p_policy_id and user_id=v_user;
  if not found then raise exception 'Policy not found' using errcode='P0002'; end if;
  if v_policy.status<>'shadow' then raise exception 'Only shadow policies can be replayed' using errcode='23514'; end if;
  if v_policy.expires_at is not null and v_policy.expires_at<=now() then raise exception 'Shadow policy has expired' using errcode='23514'; end if;
  insert into public.integration_shadow_runs(id,user_id,policy_id,window_days) values(v_run,v_user,v_policy.id,v_days);
  for v_event in select * from public.integration_events where user_id=v_user and event_type=v_policy.trigger_event_type and occurred_at>=now()-(v_days||' days')::interval order by occurred_at asc loop
    v_considered:=v_considered+1; v_result:='matched'; v_reasons:='{}'::text[]; v_score:=null; v_conf:=null; v_severity:=coalesce(v_event.payload->>'severity',v_event.payload#>>'{finding,severity}',v_event.payload#>>'{data,severity}');
    begin v_score:=coalesce(nullif(v_event.payload->>'score','')::numeric,nullif(v_event.payload#>>'{finding,score}','')::numeric,nullif(v_event.payload#>>'{data,score}','')::numeric); exception when others then v_score:=null; end;
    begin v_conf:=coalesce(nullif(v_event.payload->>'confidence','')::numeric,nullif(v_event.payload#>>'{finding,confidence}','')::numeric,nullif(v_event.payload#>>'{data,confidence}','')::numeric); exception when others then v_conf:=null; end;
    if v_policy.conditions ? 'min_score' then begin v_threshold:=(v_policy.conditions->>'min_score')::numeric; if v_score is null then v_result:='skipped'; v_reasons:=array_append(v_reasons,'score_missing'); elsif v_score<v_threshold then v_result:='skipped'; v_reasons:=array_append(v_reasons,'score_below_threshold'); end if; exception when others then v_result:='blocked'; v_reasons:=array_append(v_reasons,'invalid_min_score'); end; end if;
    if v_result<>'blocked' and v_policy.conditions ? 'min_confidence' then begin v_threshold:=(v_policy.conditions->>'min_confidence')::numeric; if v_conf is null then v_result:='skipped'; v_reasons:=array_append(v_reasons,'confidence_missing'); elsif v_conf<v_threshold then v_result:='skipped'; v_reasons:=array_append(v_reasons,'confidence_below_threshold'); end if; exception when others then v_result:='blocked'; v_reasons:=array_append(v_reasons,'invalid_min_confidence'); end; end if;
    if v_result<>'blocked' and v_policy.conditions ? 'allowed_severity' then
      if jsonb_typeof(v_policy.conditions->'allowed_severity')<>'array' then v_result:='blocked'; v_reasons:=array_append(v_reasons,'invalid_allowed_severity');
      elsif v_severity is null then v_result:='skipped'; v_reasons:=array_append(v_reasons,'severity_missing');
      elsif not exists(select 1 from jsonb_array_elements_text(v_policy.conditions->'allowed_severity') as s(value) where lower(s.value)=lower(v_severity)) then v_result:='skipped'; v_reasons:=array_append(v_reasons,'severity_not_allowed'); end if;
    end if;
    if v_result='matched' then v_matched:=v_matched+1; else v_skipped:=v_skipped+1; end if;
    insert into public.integration_policy_evaluations(user_id,policy_id,shadow_run_id,event_id,result,reasons,decision) values(v_user,v_policy.id,v_run,v_event.id,v_result,v_reasons,jsonb_build_object('score',v_score,'confidence',v_conf,'severity',v_severity,'conditions',v_policy.conditions,'policy_version',v_policy.version,'autonomy_tier',v_policy.autonomy_tier,'executed',false)) returning id into v_eval;
    if v_result='matched' then
      for v_action in select value from jsonb_array_elements(coalesce(v_policy.action_plan->'actions','[]'::jsonb)) loop
        v_external:=case when jsonb_typeof(v_action->'external_write')='boolean' then (v_action->>'external_write')::boolean else false end;
        insert into public.integration_shadow_actions(user_id,shadow_run_id,evaluation_id,action_type,target_system,would_write_external,projected_payload,blocked_reason) values(v_user,v_run,v_eval,left(v_action->>'type',100),left(v_action->>'target_system',100),v_external,jsonb_build_object('event_id',v_event.id,'event_type',v_event.event_type,'event_key',v_event.event_key,'action',v_action),'shadow_mode_no_execution');
        v_projected:=v_projected+1;
      end loop;
    end if;
  end loop;
  update public.integration_shadow_runs set events_considered=v_considered,matched=v_matched,skipped=v_skipped,projected_actions=v_projected,summary=jsonb_build_object('policy_version',v_policy.version,'trigger_event_type',v_policy.trigger_event_type,'autonomy_tier',v_policy.autonomy_tier,'required_approval',v_policy.required_approval,'execution_allowed',false),completed_at=now() where id=v_run;
  insert into public.integration_audit_log(user_id,connection_id,action,actor,details) values(v_user,null,'automation.shadow_replay.completed','user',jsonb_build_object('shadow_run_id',v_run,'policy_id',v_policy.id,'window_days',v_days,'events_considered',v_considered,'matched',v_matched,'skipped',v_skipped,'projected_actions',v_projected,'external_writes',0));
  return jsonb_build_object('shadow_run_id',v_run,'policy_id',v_policy.id,'window_days',v_days,'events_considered',v_considered,'matched',v_matched,'skipped',v_skipped,'projected_actions',v_projected,'execution_allowed',false,'message','Shadow replay completed. No external action was executed.');
end;
$$;

revoke all on function public.integration_run_shadow_policy(uuid,integer) from public,anon;
grant execute on function public.integration_run_shadow_policy(uuid,integer) to authenticated;
