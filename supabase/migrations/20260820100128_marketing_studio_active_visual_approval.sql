create or replace function public.marketing_approve_active_studio_creative(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  camp public.marketing_campaigns%rowtype;
  c public.marketing_creatives%rowtype;
  active_id uuid;
  approved_ts timestamptz := now();
begin
  if uid is null or not public.can_use_data_workbench(uid) then
    raise exception 'Marketing Studio requires Agent or higher';
  end if;
  select * into camp from public.marketing_campaigns where id=p_campaign_id and user_id=uid for update;
  if camp.id is null then raise exception 'Campaign not found'; end if;
  if coalesce(camp.settings #>> '{direct_mail,creative_source}','') <> 'watchdog_studio_visual' then raise exception 'Watchdog Studio visual is not the active creative source'; end if;
  begin active_id := nullif(camp.settings #>> '{direct_mail,active_creative_id}','')::uuid; exception when others then active_id := null; end;
  if active_id is null then raise exception 'Active Studio creative is missing'; end if;
  select * into c from public.marketing_creatives where id=active_id and campaign_id=p_campaign_id and user_id=uid and channel='direct_mail' for update;
  if c.id is null then raise exception 'Active Studio creative could not be resolved'; end if;
  if c.visual_asset_id is null and nullif(c.content->>'visual_asset_id','') is null then raise exception 'Active Studio visual is missing'; end if;
  if coalesce(trim(c.content->>'headline'),'')='' or coalesce(trim(c.content->>'body'),'')='' or coalesce(trim(c.content->>'cta'),'')='' then raise exception 'Headline, body and CTA are required'; end if;
  update public.marketing_creatives set status='superseded',updated_at=approved_ts where campaign_id=p_campaign_id and user_id=uid and channel='direct_mail' and id<>c.id and status='approved';
  update public.marketing_creatives set status='approved',approved_at=approved_ts,updated_at=approved_ts,content=coalesce(content,'{}'::jsonb)||jsonb_build_object('creative_source','watchdog_studio_visual','studio_approved_at',approved_ts) where id=c.id;
  update public.marketing_campaigns set settings=jsonb_set(jsonb_set(coalesce(settings,'{}'::jsonb),'{direct_mail,active_creative_id}',to_jsonb(c.id::text),true),'{direct_mail,studio_creative_approved_at}',to_jsonb(approved_ts),true),updated_at=approved_ts where id=p_campaign_id and user_id=uid;
  insert into public.marketing_events(user_id,campaign_id,event_type,source,payload) values(uid,p_campaign_id,'creative.studio_approved','watchdog',jsonb_build_object('creative_id',c.id,'version',c.version,'visual_asset_id',coalesce(c.visual_asset_id::text,c.content->>'visual_asset_id')));
  return jsonb_build_object('creative_id',c.id,'campaign_id',p_campaign_id,'status','approved','version',c.version,'approved_at',approved_ts);
end
$function$;
revoke all on function public.marketing_approve_active_studio_creative(uuid) from public, anon;
grant execute on function public.marketing_approve_active_studio_creative(uuid) to authenticated, service_role;
