create table if not exists public.integration_automation_policies (
  id uuid primary key default gen_random_uuid(),
  policy_group_id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  version integer not null default 1 check (version > 0),
  status text not null default 'draft' check (status in ('draft','shadow','paused','archived')),
  trigger_event_type text not null check (char_length(trigger_event_type) between 1 and 120),
  conditions jsonb not null default '{}'::jsonb check (jsonb_typeof(conditions)='object'),
  action_plan jsonb not null default '{"actions":[]}'::jsonb check (jsonb_typeof(action_plan)='object'),
  autonomy_tier smallint not null default 0 check (autonomy_tier between 0 and 4),
  required_approval text not null default 'human' check (required_approval in ('none','human','always')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,policy_group_id,version)
);
create index if not exists integration_automation_policies_user_status_idx on public.integration_automation_policies(user_id,status,updated_at desc);
create index if not exists integration_automation_policies_trigger_idx on public.integration_automation_policies(user_id,trigger_event_type,status);

create table if not exists public.integration_shadow_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  policy_id uuid not null references public.integration_automation_policies(id) on delete cascade,
  window_days integer not null check (window_days between 1 and 90),
  events_considered integer not null default 0,
  matched integer not null default 0,
  skipped integer not null default 0,
  projected_actions integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists integration_shadow_runs_user_created_idx on public.integration_shadow_runs(user_id,started_at desc);
create index if not exists integration_shadow_runs_policy_idx on public.integration_shadow_runs(policy_id,started_at desc);

create table if not exists public.integration_policy_evaluations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  policy_id uuid not null references public.integration_automation_policies(id) on delete cascade,
  shadow_run_id uuid not null references public.integration_shadow_runs(id) on delete cascade,
  event_id uuid references public.integration_events(id) on delete set null,
  mode text not null default 'shadow' check (mode='shadow'),
  result text not null check (result in ('matched','skipped','blocked')),
  reasons text[] not null default '{}'::text[],
  decision jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists integration_policy_evaluations_run_idx on public.integration_policy_evaluations(shadow_run_id,created_at);
create index if not exists integration_policy_evaluations_user_idx on public.integration_policy_evaluations(user_id,created_at desc);

create table if not exists public.integration_shadow_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  shadow_run_id uuid not null references public.integration_shadow_runs(id) on delete cascade,
  evaluation_id uuid not null references public.integration_policy_evaluations(id) on delete cascade,
  action_type text not null check (char_length(action_type) between 1 and 100),
  target_system text,
  would_write_external boolean not null default false,
  projected_payload jsonb not null default '{}'::jsonb,
  blocked_reason text not null default 'shadow_mode_no_execution',
  created_at timestamptz not null default now()
);
create index if not exists integration_shadow_actions_run_idx on public.integration_shadow_actions(shadow_run_id,created_at);

alter table public.integration_automation_policies enable row level security;
alter table public.integration_shadow_runs enable row level security;
alter table public.integration_policy_evaluations enable row level security;
alter table public.integration_shadow_actions enable row level security;
revoke all on public.integration_automation_policies,public.integration_shadow_runs,public.integration_policy_evaluations,public.integration_shadow_actions from anon,authenticated;
grant select,insert,update,delete on public.integration_automation_policies,public.integration_shadow_runs,public.integration_policy_evaluations,public.integration_shadow_actions to service_role;

create or replace function public.integration_save_shadow_policy(
  p_name text,
  p_trigger_event_type text,
  p_conditions jsonb default '{}'::jsonb,
  p_action_plan jsonb default '{"actions":[]}'::jsonb,
  p_policy_group_id uuid default null,
  p_status text default 'shadow',
  p_autonomy_tier integer default 0,
  p_required_approval text default 'human'
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_allowed boolean:=false;
  v_group uuid:=coalesce(p_policy_group_id,gen_random_uuid());
  v_version integer:=1;
  v_id uuid;
  v_actions jsonb;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select exists(select 1 from public.profiles p where p.id=v_user and p.account_role='developer') or exists(select 1 from public.account_entitlements e where e.user_id=v_user and e.plan_tier in ('pro_plus','teams','developer') and e.subscription_status in ('active','trialing','past_due','cancel_scheduled')) into v_allowed;
  if not v_allowed then raise exception 'Shadow automation policies require Pro+ or Teams' using errcode='42501'; end if;
  if p_status not in ('draft','shadow','paused') then raise exception 'Only draft, shadow, or paused policy states are allowed in this phase' using errcode='23514'; end if;
  if coalesce(p_autonomy_tier,0) not between 0 and 4 then raise exception 'Invalid autonomy tier' using errcode='23514'; end if;
  if coalesce(p_required_approval,'human') not in ('none','human','always') then raise exception 'Invalid approval mode' using errcode='23514'; end if;
  if jsonb_typeof(coalesce(p_conditions,'{}'::jsonb))<>'object' or length(coalesce(p_conditions,'{}'::jsonb)::text)>16000 then raise exception 'Invalid conditions contract' using errcode='23514'; end if;
  if jsonb_typeof(coalesce(p_action_plan,'{}'::jsonb))<>'object' or length(coalesce(p_action_plan,'{}'::jsonb)::text)>24000 then raise exception 'Invalid action plan contract' using errcode='23514'; end if;
  v_actions:=coalesce(p_action_plan->'actions','[]'::jsonb);
  if jsonb_typeof(v_actions)<>'array' or jsonb_array_length(v_actions)>10 then raise exception 'Action plan supports at most 10 shadow actions' using errcode='23514'; end if;
  if p_policy_group_id is not null then
    if not exists(select 1 from public.integration_automation_policies where user_id=v_user and policy_group_id=p_policy_group_id) then raise exception 'Policy group not found' using errcode='P0002'; end if;
    select coalesce(max(version),0)+1 into v_version from public.integration_automation_policies where user_id=v_user and policy_group_id=p_policy_group_id;
  end if;
  insert into public.integration_automation_policies(policy_group_id,user_id,name,version,status,trigger_event_type,conditions,action_plan,autonomy_tier,required_approval)
  values(v_group,v_user,left(trim(p_name),120),v_version,p_status,left(trim(p_trigger_event_type),120),coalesce(p_conditions,'{}'::jsonb),coalesce(p_action_plan,'{"actions":[]}'::jsonb),coalesce(p_autonomy_tier,0),coalesce(p_required_approval,'human')) returning id into v_id;
  insert into public.integration_audit_log(user_id,connection_id,action,actor,details) values(v_user,null,'automation.policy.version_created','user',jsonb_build_object('policy_id',v_id,'policy_group_id',v_group,'version',v_version,'status',p_status,'autonomy_tier',coalesce(p_autonomy_tier,0)));
  return jsonb_build_object('id',v_id,'policy_group_id',v_group,'version',v_version,'status',p_status,'shadow_only',true);
end;
$$;

create or replace function public.integration_list_shadow_policies()
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare v_user uuid:=auth.uid(); v_allowed boolean:=false; v_rows jsonb;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select exists(select 1 from public.profiles p where p.id=v_user and p.account_role='developer') or exists(select 1 from public.account_entitlements e where e.user_id=v_user and e.plan_tier in ('pro_plus','teams','developer') and e.subscription_status in ('active','trialing','past_due','cancel_scheduled')) into v_allowed;
  if not v_allowed then raise exception 'Shadow automation policies require Pro+ or Teams' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'policy_group_id',p.policy_group_id,'name',p.name,'version',p.version,'status',p.status,'trigger_event_type',p.trigger_event_type,'conditions',p.conditions,'action_plan',p.action_plan,'autonomy_tier',p.autonomy_tier,'required_approval',p.required_approval,'expires_at',p.expires_at,'created_at',p.created_at,'updated_at',p.updated_at,'last_shadow_run',(select jsonb_build_object('id',r.id,'window_days',r.window_days,'events_considered',r.events_considered,'matched',r.matched,'skipped',r.skipped,'projected_actions',r.projected_actions,'completed_at',r.completed_at,'summary',r.summary) from public.integration_shadow_runs r where r.policy_id=p.id and r.user_id=v_user order by r.started_at desc limit 1)) order by p.updated_at desc),'[]'::jsonb) into v_rows from public.integration_automation_policies p where p.user_id=v_user and p.status<>'archived';
  return v_rows;
end;
$$;

create or replace function public.integration_run_shadow_policy(p_policy_id uuid,p_window_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
declare
  v_user uuid:=auth.uid(); v_allowed boolean:=false; v_policy public.integration_automation_policies%rowtype; v_run uuid:=gen_random_uuid();
  v_days integer:=greatest(1,least(coalesce(p_window_days,30),90)); v_event public.integration_events%rowtype; v_eval uuid; v_action jsonb;
  v_considered integer:=0; v_matched integer:=0; v_skipped integer:=0; v_projected integer:=0; v_result text; v_reasons text[]; v_score numeric; v_conf numeric; v_severity text; v_threshold numeric;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select exists(select 1 from public.profiles p where p.id=v_user and p.account_role='developer') or exists(select 1 from public.account_entitlements e where e.user_id=v_user and e.plan_tier in ('pro_plus','teams','developer') and e.subscription_status in ('active','trialing','past_due','cancel_scheduled')) into v_allowed;
  if not v_allowed then raise exception 'Shadow automation policies require Pro+ or Teams' using errcode='42501'; end if;
  select * into v_policy from public.integration_automation_policies where id=p_policy_id and user_id=v_user;
  if not found then raise exception 'Policy not found' using errcode='P0002'; end if;
  if v_policy.status<>'shadow' then raise exception 'Only shadow policies can be replayed' using errcode='23514'; end if;
  insert into public.integration_shadow_runs(id,user_id,policy_id,window_days) values(v_run,v_user,v_policy.id,v_days);
  for v_event in select * from public.integration_events where user_id=v_user and event_type=v_policy.trigger_event_type and occurred_at>=now()-(v_days||' days')::interval order by occurred_at asc loop
    v_considered:=v_considered+1; v_result:='matched'; v_reasons:='{}'::text[]; v_score:=null; v_conf:=null; v_severity:=coalesce(v_event.payload->>'severity',v_event.payload#>>'{finding,severity}',v_event.payload#>>'{data,severity}');
    begin v_score:=coalesce(nullif(v_event.payload->>'score','')::numeric,nullif(v_event.payload#>>'{finding,score}','')::numeric,nullif(v_event.payload#>>'{data,score}','')::numeric); exception when others then v_score:=null; end;
    begin v_conf:=coalesce(nullif(v_event.payload->>'confidence','')::numeric,nullif(v_event.payload#>>'{finding,confidence}','')::numeric,nullif(v_event.payload#>>'{data,confidence}','')::numeric); exception when others then v_conf:=null; end;
    if v_policy.conditions ? 'min_score' then begin v_threshold:=(v_policy.conditions->>'min_score')::numeric; if v_score is null then v_result:='skipped'; v_reasons:=array_append(v_reasons,'score_missing'); elsif v_score<v_threshold then v_result:='skipped'; v_reasons:=array_append(v_reasons,'score_below_threshold'); end if; exception when others then v_result:='blocked'; v_reasons:=array_append(v_reasons,'invalid_min_score'); end; end if;
    if v_result<>'blocked' and v_policy.conditions ? 'min_confidence' then begin v_threshold:=(v_policy.conditions->>'min_confidence')::numeric; if v_conf is null then v_result:='skipped'; v_reasons:=array_append(v_reasons,'confidence_missing'); elsif v_conf<v_threshold then v_result:='skipped'; v_reasons:=array_append(v_reasons,'confidence_below_threshold'); end if; exception when others then v_result:='blocked'; v_reasons:=array_append(v_reasons,'invalid_min_confidence'); end; end if;
    if v_result<>'blocked' and v_policy.conditions ? 'allowed_severity' then if jsonb_typeof(v_policy.conditions->'allowed_severity')<>'array' then v_result:='blocked'; v_reasons:=array_append(v_reasons,'invalid_allowed_severity'); elsif v_severity is null then v_result:='skipped'; v_reasons:=array_append(v_reasons,'severity_missing'); elsif not exists(select 1 from jsonb_array_elements_text(v_policy.conditions->'allowed_severity') a where lower(a)=lower(v_severity)) then v_result:='skipped'; v_reasons:=array_append(v_reasons,'severity_not_allowed'); end if; end if;
    if v_result='matched' then v_matched:=v_matched+1; else v_skipped:=v_skipped+1; end if;
    insert into public.integration_policy_evaluations(user_id,policy_id,shadow_run_id,event_id,result,reasons,decision) values(v_user,v_policy.id,v_run,v_event.id,v_result,v_reasons,jsonb_build_object('score',v_score,'confidence',v_conf,'severity',v_severity,'conditions',v_policy.conditions,'policy_version',v_policy.version,'autonomy_tier',v_policy.autonomy_tier,'executed',false)) returning id into v_eval;
    if v_result='matched' then
      for v_action in select value from jsonb_array_elements(coalesce(v_policy.action_plan->'actions','[]'::jsonb)) loop
        insert into public.integration_shadow_actions(user_id,shadow_run_id,evaluation_id,action_type,target_system,would_write_external,projected_payload,blocked_reason) values(v_user,v_run,v_eval,left(coalesce(v_action->>'type','unspecified'),100),left(v_action->>'target_system',100),coalesce((v_action->>'external_write')::boolean,false),jsonb_build_object('event_id',v_event.id,'event_type',v_event.event_type,'event_key',v_event.event_key,'action',v_action),'shadow_mode_no_execution');
        v_projected:=v_projected+1;
      end loop;
    end if;
  end loop;
  update public.integration_shadow_runs set events_considered=v_considered,matched=v_matched,skipped=v_skipped,projected_actions=v_projected,summary=jsonb_build_object('policy_version',v_policy.version,'trigger_event_type',v_policy.trigger_event_type,'autonomy_tier',v_policy.autonomy_tier,'required_approval',v_policy.required_approval,'execution_allowed',false),completed_at=now() where id=v_run;
  insert into public.integration_audit_log(user_id,connection_id,action,actor,details) values(v_user,null,'automation.shadow_replay.completed','user',jsonb_build_object('shadow_run_id',v_run,'policy_id',v_policy.id,'window_days',v_days,'events_considered',v_considered,'matched',v_matched,'skipped',v_skipped,'projected_actions',v_projected,'external_writes',0));
  return jsonb_build_object('shadow_run_id',v_run,'policy_id',v_policy.id,'window_days',v_days,'events_considered',v_considered,'matched',v_matched,'skipped',v_skipped,'projected_actions',v_projected,'execution_allowed',false,'message','Shadow replay completed. No external action was executed.');
end;
$$;

revoke all on function public.integration_save_shadow_policy(text,text,jsonb,jsonb,uuid,text,integer,text) from public,anon;
revoke all on function public.integration_list_shadow_policies() from public,anon;
revoke all on function public.integration_run_shadow_policy(uuid,integer) from public,anon;
grant execute on function public.integration_save_shadow_policy(text,text,jsonb,jsonb,uuid,text,integer,text) to authenticated;
grant execute on function public.integration_list_shadow_policies() to authenticated;
grant execute on function public.integration_run_shadow_policy(uuid,integer) to authenticated;
