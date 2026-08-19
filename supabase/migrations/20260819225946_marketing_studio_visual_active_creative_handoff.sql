create or replace function public.marketing_activate_studio_visual(p_campaign_id uuid, p_asset_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid:=auth.uid();
  a public.marketing_intelligence_visual_assets%rowtype;
  c public.marketing_creatives%rowtype;
  src_at timestamptz:=now();
begin
  if uid is null or not public.can_use_data_workbench(uid) then
    raise exception 'Marketing Studio requires Agent or higher';
  end if;

  select * into a
  from public.marketing_intelligence_visual_assets
  where id=p_asset_id and campaign_id=p_campaign_id and user_id=uid
  for update;
  if a.id is null then raise exception 'Studio visual asset not found'; end if;
  if a.status <> 'selected' or a.production_status <> 'preview_only' then
    raise exception 'Select the Studio preview before activating it';
  end if;

  if a.creative_id is not null then
    select * into c from public.marketing_creatives
    where id=a.creative_id and campaign_id=p_campaign_id and user_id=uid and channel='direct_mail'
    for update;
  end if;
  if c.id is null then
    select * into c from public.marketing_creatives
    where campaign_id=p_campaign_id and user_id=uid and channel='direct_mail'
      and visual_asset_id=p_asset_id
    order by version desc, created_at desc limit 1
    for update;
  end if;
  if c.id is null then raise exception 'Studio creative draft not found'; end if;

  update public.marketing_creatives
  set status='superseded', updated_at=now()
  where campaign_id=p_campaign_id and user_id=uid and channel='direct_mail'
    and status='approved' and id<>c.id;

  update public.marketing_creatives
  set provider_design_id=null,
      content=coalesce(content,'{}'::jsonb) || jsonb_build_object(
        'creative_source','watchdog_studio_visual',
        'provider_managed',false,
        'visual_asset_id',p_asset_id::text,
        'visual_asset_status','preview_only',
        'visual_style_preset',a.style_preset_key,
        'pcm_proof_required',true
      ),
      updated_at=now()
  where id=c.id and user_id=uid;

  update public.marketing_campaigns
  set settings=jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(coalesce(settings,'{}'::jsonb),'{direct_mail,creative_source}',to_jsonb('watchdog_studio_visual'::text),true),
            '{direct_mail,active_creative_id}',to_jsonb(c.id::text),true),
          '{direct_mail,studio_visual_asset_id}',to_jsonb(p_asset_id::text),true),
        '{direct_mail,creative_source_selected_at}',to_jsonb(src_at),true),
      updated_at=now()
  where id=p_campaign_id and user_id=uid;

  update public.marketing_intelligence_visual_assets
  set creative_id=c.id, updated_at=now()
  where id=p_asset_id and user_id=uid;

  insert into public.marketing_events(user_id,campaign_id,event_type,source,payload)
  values(uid,p_campaign_id,'creative.studio_visual_activated','watchdog_intelligence',
    jsonb_build_object('creative_id',c.id,'asset_id',p_asset_id,'version',c.version,'production_status','preview_only','pcm_design_preserved',true));

  return jsonb_build_object('creative_id',c.id,'asset_id',p_asset_id,'version',c.version,'status','draft','creative_source','watchdog_studio_visual');
end $$;
revoke all on function public.marketing_activate_studio_visual(uuid,uuid) from public,anon;
grant execute on function public.marketing_activate_studio_visual(uuid,uuid) to authenticated;

create or replace function public.marketing_pcm_design_state(p_campaign_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=public
as $$
declare
  uid uuid:=auth.uid();
  s jsonb;
  dm jsonb;
  pcm_at timestamptz;
  source_at timestamptz;
begin
  if uid is null then raise exception 'Sign in required'; end if;
  select coalesce(settings->'pcm_design','{}'::jsonb),coalesce(settings->'direct_mail','{}'::jsonb)
    into s,dm
  from public.marketing_campaigns where id=p_campaign_id and user_id=uid;
  if s is null then raise exception 'Campaign not found'; end if;

  if coalesce(dm->>'creative_source','')='watchdog_studio_visual' then
    begin pcm_at := nullif(s->>'selected_at','')::timestamptz; exception when others then pcm_at:=null; end;
    begin source_at := nullif(dm->>'creative_source_selected_at','')::timestamptz; exception when others then source_at:=null; end;
    if source_at is not null and (pcm_at is null or pcm_at <= source_at) then
      return '{}'::jsonb;
    end if;
  end if;
  return s;
end $$;
revoke all on function public.marketing_pcm_design_state(uuid) from public,anon;
grant execute on function public.marketing_pcm_design_state(uuid) to authenticated;
