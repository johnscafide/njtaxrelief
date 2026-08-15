create or replace function public.marketing_bind_pcm_design(p_campaign_id uuid, p_design_id text, p_force_new_revision boolean default false)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $function$
declare
  uid uuid:=auth.uid();
  did text:=left(trim(coalesce(p_design_id,'')),120);
  camp public.marketing_campaigns%rowtype;
  latest public.marketing_creatives%rowtype;
  tmpl public.marketing_creative_templates%rowtype;
  nextv int;
  cid uuid;
  brand uuid;
  track uuid;
  pcm jsonb;
  vars jsonb;
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  select * into camp from public.marketing_campaigns where id=p_campaign_id and user_id=uid for update;
  if camp.id is null then raise exception 'Campaign not found'; end if;
  pcm:=coalesce(camp.settings->'pcm_design','{}'::jsonb);
  if did='' or coalesce(pcm->>'design_id','')<>did then raise exception 'Select this PCM design before binding it to the campaign creative'; end if;
  vars:=coalesce(pcm->'variables','{}'::jsonb);

  select * into latest from public.marketing_creatives
  where campaign_id=p_campaign_id and user_id=uid and channel='direct_mail'
  order by version desc,created_at desc limit 1;

  if latest.id is not null and latest.provider_design_id=did and not coalesce(p_force_new_revision,false) then
    update public.marketing_campaigns
    set settings=jsonb_set(settings,'{pcm_design,creative_id}',to_jsonb(latest.id::text),true),updated_at=now()
    where id=p_campaign_id and user_id=uid;
    return jsonb_build_object('creative_id',latest.id,'version',latest.version,'status',latest.status,'provider_design_id',did,'created',false);
  end if;

  if latest.id is not null then
    select coalesce(max(version),0)+1 into nextv from public.marketing_creatives where campaign_id=p_campaign_id and user_id=uid and channel='direct_mail';
    insert into public.marketing_creatives(user_id,campaign_id,brand_profile_id,channel,creative_type,version,content,status,template_key,provider_design_id,tracking_link_id)
    values(uid,p_campaign_id,latest.brand_profile_id,'direct_mail',latest.creative_type,nextv,coalesce(latest.content,'{}'::jsonb)||jsonb_build_object('provider_managed',true,'pcm_variables',vars),'draft',latest.template_key,did,latest.tracking_link_id)
    returning id into cid;
  else
    select * into tmpl from public.marketing_creative_templates
    where active
    order by (camp.profession=any(professions) and camp.goal=any(goals)) desc,(camp.profession=any(professions)) desc,sort_order asc
    limit 1;
    if tmpl.id is null then raise exception 'No active direct-mail creative template is available'; end if;
    select id into brand from public.marketing_brand_profiles where user_id=uid order by is_default desc,updated_at desc limit 1;
    select id into track from public.marketing_tracking_links where campaign_id=p_campaign_id and user_id=uid and active order by created_at desc limit 1;
    nextv:=1;
    insert into public.marketing_creatives(user_id,campaign_id,brand_profile_id,channel,creative_type,version,content,status,template_key,provider_design_id,tracking_link_id)
    values(uid,p_campaign_id,brand,'direct_mail',tmpl.creative_type,nextv,coalesce(tmpl.content,'{}'::jsonb)||jsonb_build_object('provider_managed',true,'pcm_variables',vars),'draft',tmpl.template_key,did,track)
    returning id into cid;
  end if;

  update public.marketing_campaigns
  set settings=jsonb_set(settings,'{pcm_design,creative_id}',to_jsonb(cid::text),true),updated_at=now()
  where id=p_campaign_id and user_id=uid;
  insert into public.marketing_events(user_id,campaign_id,event_type,source,payload)
  values(uid,p_campaign_id,'creative.pcm_design_bound','pcm',jsonb_build_object('creative_id',cid,'design_id',did,'version',nextv,'variable_count',(select count(*) from jsonb_object_keys(vars))));
  return jsonb_build_object('creative_id',cid,'version',nextv,'status','draft','provider_design_id',did,'created',true);
end
$function$;
revoke all on function public.marketing_bind_pcm_design(uuid,text,boolean) from public,anon;
grant execute on function public.marketing_bind_pcm_design(uuid,text,boolean) to authenticated,service_role;
