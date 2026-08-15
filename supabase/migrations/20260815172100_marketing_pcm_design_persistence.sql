create or replace function public.marketing_select_pcm_design(p_campaign_id uuid, p_design_id text, p_metadata jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $function$
declare
  uid uuid:=auth.uid();
  did text:=left(trim(coalesce(p_design_id,'')),120);
  incoming jsonb:=coalesce(p_metadata,'{}'::jsonb);
  current_state jsonb:='{}'::jsonb;
  safe_meta jsonb;
  next_state jsonb;
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  if did='' then raise exception 'PCM design ID is required'; end if;
  if jsonb_typeof(incoming)<>'object' then raise exception 'PCM design metadata must be an object'; end if;
  if length(incoming::text)>30000 then raise exception 'PCM design metadata is too large'; end if;
  select coalesce(settings->'pcm_design','{}'::jsonb) into current_state
  from public.marketing_campaigns where id=p_campaign_id and user_id=uid for update;
  if not found then raise exception 'Campaign not found'; end if;

  safe_meta:=jsonb_strip_nulls(jsonb_build_object(
    'name',nullif(left(trim(coalesce(incoming->>'name','')),180),''),
    'type',nullif(left(trim(coalesce(incoming->>'type','')),80),''),
    'size',nullif(left(trim(coalesce(incoming->>'size','')),100),''),
    'orientation',nullif(left(trim(coalesce(incoming->>'orientation','')),60),''),
    'status',nullif(left(trim(coalesce(incoming->>'status','')),80),''),
    'thumbnail_url',nullif(left(trim(coalesce(incoming->>'thumbnail_url','')),1600),''),
    'front_url',nullif(left(trim(coalesce(incoming->>'front_url','')),1600),''),
    'back_url',nullif(left(trim(coalesce(incoming->>'back_url','')),1600),''),
    'proof_url',nullif(left(trim(coalesce(incoming->>'proof_url','')),1600),''),
    'variable_count',case when (incoming->>'variable_count')~'^\d+$' then least((incoming->>'variable_count')::int,100) else null end,
    'provider_editability',nullif(left(trim(coalesce(incoming->>'provider_editability','')),80),'')
  ));

  if coalesce(current_state->>'design_id','')=did then
    next_state:=current_state || jsonb_build_object('design_id',did,'metadata',safe_meta,'selected_at',now());
  else
    next_state:=jsonb_build_object('design_id',did,'metadata',safe_meta,'variables','{}'::jsonb,'proof_review',jsonb_build_object('status','unreviewed'),'selected_at',now());
  end if;

  update public.marketing_campaigns
  set settings=jsonb_set(coalesce(settings,'{}'::jsonb),'{pcm_design}',next_state,true),updated_at=now()
  where id=p_campaign_id and user_id=uid;

  insert into public.marketing_events(user_id,campaign_id,event_type,source,payload)
  values(uid,p_campaign_id,'creative.pcm_design_selected','pcm',jsonb_build_object('design_id',did,'metadata',safe_meta));
  return next_state;
end
$function$;

create or replace function public.marketing_save_pcm_design_variables(p_campaign_id uuid, p_design_id text, p_variables jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $function$
declare
  uid uuid:=auth.uid();
  vars jsonb:=coalesce(p_variables,'{}'::jsonb);
  did text:=left(trim(coalesce(p_design_id,'')),120);
  current_state jsonb:='{}'::jsonb;
  next_state jsonb;
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  if did='' then raise exception 'PCM design ID is required'; end if;
  if jsonb_typeof(vars)<>'object' then raise exception 'PCM design variables must be an object'; end if;
  if length(vars::text)>50000 then raise exception 'PCM design variable state is too large'; end if;
  select coalesce(settings->'pcm_design','{}'::jsonb) into current_state
  from public.marketing_campaigns where id=p_campaign_id and user_id=uid for update;
  if not found then raise exception 'Campaign not found'; end if;
  if coalesce(current_state->>'design_id','')<>did then
    current_state:=jsonb_build_object('design_id',did,'metadata','{}'::jsonb,'proof_review',jsonb_build_object('status','unreviewed'),'selected_at',now());
  end if;
  next_state:=current_state || jsonb_build_object('design_id',did,'variables',vars,'saved_at',now());
  update public.marketing_campaigns
  set settings=jsonb_set(coalesce(settings,'{}'::jsonb),'{pcm_design}',next_state,true),updated_at=now()
  where id=p_campaign_id and user_id=uid;
  insert into public.marketing_events(user_id,campaign_id,event_type,source,payload)
  values(uid,p_campaign_id,'creative.pcm_variables_saved','pcm',jsonb_build_object('design_id',did,'variable_count',(select count(*) from jsonb_object_keys(vars))));
  return next_state;
end
$function$;

create or replace function public.marketing_set_pcm_proof_review(p_campaign_id uuid, p_design_id text, p_status text)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $function$
declare
  uid uuid:=auth.uid();
  did text:=left(trim(coalesce(p_design_id,'')),120);
  st text:=lower(trim(coalesce(p_status,'')));
  current_state jsonb:='{}'::jsonb;
  next_state jsonb;
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  if st not in ('unreviewed','approved','rejected') then raise exception 'Unsupported PCM proof review status'; end if;
  select coalesce(settings->'pcm_design','{}'::jsonb) into current_state
  from public.marketing_campaigns where id=p_campaign_id and user_id=uid for update;
  if not found then raise exception 'Campaign not found'; end if;
  if did='' or coalesce(current_state->>'design_id','')<>did then raise exception 'Select this PCM design before reviewing its proof'; end if;
  next_state:=current_state || jsonb_build_object('proof_review',jsonb_build_object('status',st,'reviewed_at',case when st='unreviewed' then null else now() end));
  update public.marketing_campaigns
  set settings=jsonb_set(coalesce(settings,'{}'::jsonb),'{pcm_design}',next_state,true),updated_at=now()
  where id=p_campaign_id and user_id=uid;
  insert into public.marketing_events(user_id,campaign_id,event_type,source,payload)
  values(uid,p_campaign_id,'creative.pcm_proof_reviewed','pcm',jsonb_build_object('design_id',did,'status',st));
  return next_state;
end
$function$;

revoke all on function public.marketing_select_pcm_design(uuid,text,jsonb) from public, anon;
revoke all on function public.marketing_set_pcm_proof_review(uuid,text,text) from public, anon;
revoke all on function public.marketing_save_pcm_design_variables(uuid,text,jsonb) from public, anon;
grant execute on function public.marketing_select_pcm_design(uuid,text,jsonb) to authenticated, service_role;
grant execute on function public.marketing_set_pcm_proof_review(uuid,text,text) to authenticated, service_role;
grant execute on function public.marketing_save_pcm_design_variables(uuid,text,jsonb) to authenticated, service_role;
