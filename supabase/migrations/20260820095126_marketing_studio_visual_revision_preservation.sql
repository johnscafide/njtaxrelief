create or replace function public.marketing_save_creative(p_campaign_id uuid,p_template_key text,p_content jsonb,p_provider_design_id text default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  uid uuid:=auth.uid(); tmpl public.marketing_creative_templates%rowtype; brand uuid; nextv integer; cid uuid; track uuid; ctype text;
  camp public.marketing_campaigns%rowtype; active public.marketing_creatives%rowtype; studio_asset uuid; final_content jsonb; studio boolean:=false;
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  select * into camp from public.marketing_campaigns where id=p_campaign_id and user_id=uid for update;
  if camp.id is null then raise exception 'Campaign not found'; end if;
  select * into tmpl from public.marketing_creative_templates where template_key=p_template_key and active;
  if tmpl.id is null then raise exception 'Creative template not found'; end if;
  select id into brand from public.marketing_brand_profiles where user_id=uid order by is_default desc,updated_at desc limit 1;
  select coalesce(max(version),0)+1 into nextv from public.marketing_creatives where campaign_id=p_campaign_id and channel='direct_mail';
  select id into track from public.marketing_tracking_links where campaign_id=p_campaign_id and user_id=uid and active order by created_at desc limit 1;
  ctype:=tmpl.creative_type;
  studio:=coalesce(camp.settings#>>'{direct_mail,creative_source}','')='watchdog_studio_visual';
  if studio then
    begin select * into active from public.marketing_creatives where id=(camp.settings#>>'{direct_mail,active_creative_id}')::uuid and campaign_id=p_campaign_id and user_id=uid; exception when others then active.id:=null; end;
    if active.id is null then select * into active from public.marketing_creatives where campaign_id=p_campaign_id and user_id=uid and channel='direct_mail' and visual_asset_id is not null order by version desc limit 1; end if;
    studio_asset:=coalesce(active.visual_asset_id,nullif(active.content->>'visual_asset_id','')::uuid);
    if studio_asset is null then studio:=false; end if;
  end if;
  final_content:=tmpl.content||coalesce(p_content,'{}'::jsonb);
  if studio then final_content:=final_content||jsonb_build_object('creative_source','watchdog_studio_visual','visual_asset_id',studio_asset,'visual_asset_status','preview_only'); end if;
  insert into public.marketing_creatives(user_id,campaign_id,brand_profile_id,channel,creative_type,version,content,status,template_key,provider_design_id,tracking_link_id,visual_asset_id)
  values(uid,p_campaign_id,brand,'direct_mail',ctype,nextv,final_content,'draft',tmpl.template_key,case when studio then null else nullif(trim(p_provider_design_id),'') end,track,case when studio then studio_asset else null end) returning id into cid;
  if studio then
    update public.marketing_intelligence_visual_assets set creative_id=cid,production_status='preview_only',updated_at=now() where id=studio_asset and user_id=uid and campaign_id=p_campaign_id;
    update public.marketing_pcm_studio_handoffs set status='superseded',updated_at=now() where campaign_id=p_campaign_id and user_id=uid and status<>'superseded';
    update public.marketing_campaigns set settings=(coalesce(settings,'{}'::jsonb) #- '{direct_mail,pcm_handoff_id}' #- '{direct_mail,pcm_handoff_package_hash}') || jsonb_build_object('direct_mail',(coalesce(settings->'direct_mail','{}'::jsonb) - 'pcm_handoff_id' - 'pcm_handoff_package_hash') || jsonb_build_object('creative_source','watchdog_studio_visual','active_creative_id',cid::text,'studio_visual_asset_id',studio_asset::text,'studio_visual_status','preview_only','pcm_handoff_status','not_prepared')),updated_at=now() where id=p_campaign_id and user_id=uid;
  end if;
  insert into public.marketing_events(user_id,campaign_id,event_type,source,payload) values(uid,p_campaign_id,'creative.saved','watchdog',jsonb_build_object('creative_id',cid,'template_key',tmpl.template_key,'version',nextv,'studio_visual_preserved',studio,'visual_asset_id',studio_asset));
  return cid;
end $$;
revoke all on function public.marketing_save_creative(uuid,text,jsonb,text) from public,anon;
grant execute on function public.marketing_save_creative(uuid,text,jsonb,text) to authenticated;
