create or replace function public.marketing_prepare_pcm_studio_handoff(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  uid uuid:=auth.uid();
  camp public.marketing_campaigns%rowtype;
  cr public.marketing_creatives%rowtype;
  va public.marketing_intelligence_visual_assets%rowtype;
  brand public.marketing_brand_profiles%rowtype;
  active_creative uuid;
  asset_id uuid;
  package jsonb;
  brand_package jsonb;
  brand_profile_id uuid;
  invalid_brand_asset boolean:=false;
  hash text;
  existing public.marketing_pcm_studio_handoffs%rowtype;
  hid uuid;
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  select * into camp from public.marketing_campaigns where id=p_campaign_id and user_id=uid for update;
  if camp.id is null then raise exception 'Campaign not found'; end if;
  if coalesce(camp.settings#>>'{direct_mail,creative_source}','')<>'watchdog_studio_visual' then raise exception 'Choose a Watchdog Studio visual before preparing the Watchdog Designs handoff'; end if;
  begin active_creative:=nullif(camp.settings#>>'{direct_mail,active_creative_id}','')::uuid; exception when others then active_creative:=null; end;
  if active_creative is null then raise exception 'Active Studio creative is missing'; end if;
  select * into cr from public.marketing_creatives where id=active_creative and campaign_id=p_campaign_id and user_id=uid and channel='direct_mail';
  if cr.id is null then raise exception 'Active Studio creative was not found'; end if;
  if cr.status<>'approved' then raise exception 'Approve the Studio creative before preparing the Watchdog Designs handoff'; end if;
  asset_id:=coalesce(cr.visual_asset_id,nullif(cr.content->>'visual_asset_id','')::uuid);
  if asset_id is null then raise exception 'Selected Studio visual is missing'; end if;
  select * into va from public.marketing_intelligence_visual_assets where id=asset_id and campaign_id=p_campaign_id and user_id=uid;
  if va.id is null or va.status not in ('selected','generated') then raise exception 'Selected Studio visual is not available'; end if;
  if coalesce(va.storage_path,'')='' then raise exception 'Selected Studio visual has no stored artwork'; end if;

  if jsonb_typeof(cr.content->'wdd_brand')='object' and coalesce(cr.content#>>'{wdd_brand,brand_profile_id}','')<>'' then
    begin brand_profile_id:=(cr.content#>>'{wdd_brand,brand_profile_id}')::uuid; exception when others then raise exception 'Approved creative contains an invalid Brand & Media profile reference'; end;
    select * into brand from public.marketing_brand_profiles b where b.id=brand_profile_id and (b.user_id=uid or (b.organization_id is not null and public.watchdog_is_org_member(b.organization_id,null))) limit 1;
    if brand.id is null then raise exception 'Approved creative Brand & Media profile is no longer accessible'; end if;
    select exists(
      select 1
      from jsonb_array_elements(case when jsonb_typeof(cr.content#>'{wdd_brand,assets}')='array' then cr.content#>'{wdd_brand,assets}' else '[]'::jsonb end) e
      left join public.marketing_brand_assets a on a.id=case when coalesce(e->>'id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then (e->>'id')::uuid else null end and a.brand_profile_id=brand.id
      left join storage.objects o on o.bucket_id=a.storage_bucket and o.name=a.storage_path
      where a.id is null or o.id is null or a.storage_path<>coalesce(e->>'storage_path','') or a.storage_bucket<>coalesce(e->>'storage_bucket','')
    ) into invalid_brand_asset;
    if invalid_brand_asset then raise exception 'One or more Brand & Media assets in the approved creative are unavailable. Save and approve a new creative version.'; end if;
    brand_package:=cr.content->'wdd_brand';
  else
    if cr.brand_profile_id is not null then select * into brand from public.marketing_brand_profiles where id=cr.brand_profile_id and user_id=uid; end if;
    if brand.id is null then select * into brand from public.marketing_brand_profiles where user_id=uid order by is_default desc,updated_at desc limit 1; end if;
    brand_package:=jsonb_build_object('version',0,'brand_profile_id',brand.id,'profile',coalesce(brand.profile,'{}'::jsonb),'assets','[]'::jsonb,'legacy_live_profile_fallback',true);
  end if;

  package:=jsonb_build_object(
    'contract_version','wdd-postcard-composition-v3',
    'campaign',jsonb_build_object('id',camp.id,'name',camp.name,'goal',camp.goal,'profession',camp.profession),
    'creative',jsonb_build_object('id',cr.id,'version',cr.version,'headline',cr.content->>'headline','body',cr.content->>'body','cta',cr.content->>'cta','disclaimer',cr.content->>'disclaimer','mail_class','FirstClass','source','watchdog_studio_visual','composition',coalesce(cr.content->'wdd_composition','{}'::jsonb)),
    'brand',brand_package,
    'format',jsonb_build_object('product_type','postcard','size_label','6 x 8.5','mail_class','FirstClass','mechanical_spec_owner','provider'),
    'visual',jsonb_build_object('id',va.id,'storage_bucket',va.storage_bucket,'storage_path',va.storage_path,'mime_type',va.mime_type,'width',va.width,'height',va.height,'bytes',va.bytes,'style_preset_key',va.style_preset_key,'prompt_hash',va.prompt_hash,'generator_provider',va.provider,'generator_model',va.model),
    'boundary',jsonb_build_object('provider_mutation_enabled',false,'provider_asset_mapping_contract','pending','watchdog_artwork_state','frozen_candidate','requires_production_proof',true)
  );
  hash:=encode(digest(package::text,'sha256'),'hex');
  select * into existing from public.marketing_pcm_studio_handoffs where campaign_id=p_campaign_id and user_id=uid and package_hash=hash and status<>'superseded' order by created_at desc limit 1;
  if existing.id is not null then return public.marketing_pcm_studio_handoff_state(p_campaign_id); end if;
  update public.marketing_pcm_studio_handoffs set status='superseded',updated_at=now() where campaign_id=p_campaign_id and user_id=uid and status<>'superseded';
  insert into public.marketing_pcm_studio_handoffs(user_id,campaign_id,creative_id,visual_asset_id,status,creative_snapshot,brand_snapshot,asset_snapshot,package_hash,blocked_reason)
  values(uid,p_campaign_id,cr.id,va.id,'provider_contract_pending',package->'creative',package->'brand',package->'visual',hash,'Watchdog Designs production asset mapping contract is not yet configured') returning id into hid;
  update public.marketing_intelligence_visual_assets set production_status='awaiting_pcm_mapping',updated_at=now() where id=va.id and user_id=uid;
  update public.marketing_campaigns set settings=jsonb_set(jsonb_set(jsonb_set(coalesce(settings,'{}'::jsonb),'{direct_mail,pcm_handoff_id}',to_jsonb(hid::text),true),'{direct_mail,pcm_handoff_status}',to_jsonb('provider_contract_pending'::text),true),'{direct_mail,pcm_handoff_package_hash}',to_jsonb(hash),true),updated_at=now() where id=p_campaign_id and user_id=uid;
  insert into public.marketing_events(user_id,campaign_id,event_type,source,payload) values(uid,p_campaign_id,'creative.pcm_studio_handoff_prepared','watchdog',jsonb_build_object('handoff_id',hid,'creative_id',cr.id,'visual_asset_id',va.id,'package_hash',hash,'composition_version',coalesce(cr.content#>>'{wdd_composition,version}','0'),'brand_snapshot_version',coalesce(cr.content#>>'{wdd_brand,version}','0'),'provider_mutation_enabled',false,'blocked_reason','watchdog_designs_asset_mapping_contract_pending'));
  return public.marketing_pcm_studio_handoff_state(p_campaign_id);
end $$;
