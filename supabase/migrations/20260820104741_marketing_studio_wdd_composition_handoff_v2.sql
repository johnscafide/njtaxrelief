create or replace function public.marketing_prepare_pcm_studio_handoff(p_campaign_id uuid) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare
  uid uuid:=auth.uid(); camp public.marketing_campaigns%rowtype; cr public.marketing_creatives%rowtype; va public.marketing_intelligence_visual_assets%rowtype;
  brand public.marketing_brand_profiles%rowtype; active_creative uuid; asset_id uuid; package jsonb; hash text; existing public.marketing_pcm_studio_handoffs%rowtype; hid uuid;
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
  if cr.brand_profile_id is not null then select * into brand from public.marketing_brand_profiles where id=cr.brand_profile_id and user_id=uid; end if;
  if brand.id is null then select * into brand from public.marketing_brand_profiles where user_id=uid order by is_default desc,updated_at desc limit 1; end if;
  package:=jsonb_build_object(
    'contract_version','wdd-postcard-composition-v2',
    'campaign',jsonb_build_object('id',camp.id,'name',camp.name,'goal',camp.goal,'profession',camp.profession),
    'creative',jsonb_build_object('id',cr.id,'version',cr.version,'headline',cr.content->>'headline','body',cr.content->>'body','cta',cr.content->>'cta','disclaimer',cr.content->>'disclaimer','mail_class','FirstClass','source','watchdog_studio_visual','composition',coalesce(cr.content->'wdd_composition','{}'::jsonb)),
    'brand',jsonb_build_object('id',brand.id,'name',brand.name,'profile',coalesce(brand.profile,'{}'::jsonb)),
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
  insert into public.marketing_events(user_id,campaign_id,event_type,source,payload) values(uid,p_campaign_id,'creative.pcm_studio_handoff_prepared','watchdog',jsonb_build_object('handoff_id',hid,'creative_id',cr.id,'visual_asset_id',va.id,'package_hash',hash,'composition_version',coalesce(cr.content#>>'{wdd_composition,version}','0'),'provider_mutation_enabled',false,'blocked_reason','watchdog_designs_asset_mapping_contract_pending'));
  return public.marketing_pcm_studio_handoff_state(p_campaign_id);
end $$;
revoke all on function public.marketing_prepare_pcm_studio_handoff(uuid) from public,anon;
grant execute on function public.marketing_prepare_pcm_studio_handoff(uuid) to authenticated;
