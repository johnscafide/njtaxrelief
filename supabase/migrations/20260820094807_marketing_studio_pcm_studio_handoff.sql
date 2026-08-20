create table if not exists public.marketing_pcm_studio_handoffs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.marketing_campaigns(id) on delete cascade,
  creative_id uuid not null references public.marketing_creatives(id) on delete restrict,
  visual_asset_id uuid not null references public.marketing_intelligence_visual_assets(id) on delete restrict,
  provider_key text not null default 'pcm' check (provider_key='pcm'),
  status text not null default 'provider_contract_pending' check (status in ('provider_contract_pending','ready_for_provider','mapped_to_pcm','proof_ready','proof_approved','superseded','failed')),
  product_type text not null default 'postcard' check (product_type='postcard'),
  size_label text not null default '6 x 8.5' check (size_label='6 x 8.5'),
  mail_class text not null default 'FirstClass' check (mail_class='FirstClass'),
  creative_snapshot jsonb not null default '{}'::jsonb,
  brand_snapshot jsonb not null default '{}'::jsonb,
  asset_snapshot jsonb not null default '{}'::jsonb,
  package_hash text not null,
  provider_design_id text,
  provider_proof jsonb not null default '{}'::jsonb,
  provider_contract_version text,
  blocked_reason text,
  prepared_at timestamptz not null default now(),
  mapped_at timestamptz,
  proof_received_at timestamptz,
  proof_approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketing_pcm_studio_handoffs_campaign_idx on public.marketing_pcm_studio_handoffs(campaign_id,created_at desc);
create index if not exists marketing_pcm_studio_handoffs_user_idx on public.marketing_pcm_studio_handoffs(user_id,created_at desc);
create index if not exists marketing_pcm_studio_handoffs_creative_idx on public.marketing_pcm_studio_handoffs(creative_id);
create index if not exists marketing_pcm_studio_handoffs_visual_idx on public.marketing_pcm_studio_handoffs(visual_asset_id);
create unique index if not exists marketing_pcm_studio_handoffs_active_hash_uidx on public.marketing_pcm_studio_handoffs(campaign_id,package_hash) where status<>'superseded';

alter table public.marketing_pcm_studio_handoffs enable row level security;
drop policy if exists marketing_pcm_studio_handoffs_owner_select on public.marketing_pcm_studio_handoffs;
create policy marketing_pcm_studio_handoffs_owner_select on public.marketing_pcm_studio_handoffs for select to authenticated using (user_id=auth.uid());
revoke all on public.marketing_pcm_studio_handoffs from public,anon;
grant select on public.marketing_pcm_studio_handoffs to authenticated;

create or replace function public.marketing_pcm_studio_handoff_state(p_campaign_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare uid uuid:=auth.uid(); camp public.marketing_campaigns%rowtype; h public.marketing_pcm_studio_handoffs%rowtype; active_creative uuid; begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  select * into camp from public.marketing_campaigns where id=p_campaign_id and user_id=uid;
  if camp.id is null then raise exception 'Campaign not found'; end if;
  begin active_creative:=nullif(camp.settings#>>'{direct_mail,active_creative_id}','')::uuid; exception when others then active_creative:=null; end;
  select * into h from public.marketing_pcm_studio_handoffs where campaign_id=p_campaign_id and user_id=uid and status<>'superseded' order by created_at desc limit 1;
  if h.id is null then return jsonb_build_object('exists',false,'active_creative_id',active_creative,'creative_source',camp.settings#>>'{direct_mail,creative_source}','provider_mutation_enabled',false,'provider_contract_status','pending'); end if;
  return jsonb_build_object(
    'exists',true,'id',h.id,'status',h.status,'creative_id',h.creative_id,'visual_asset_id',h.visual_asset_id,
    'package_hash',h.package_hash,'product_type',h.product_type,'size_label',h.size_label,'mail_class',h.mail_class,
    'provider_key',h.provider_key,'provider_design_id',h.provider_design_id,'provider_proof',h.provider_proof,
    'blocked_reason',h.blocked_reason,'prepared_at',h.prepared_at,'mapped_at',h.mapped_at,'proof_received_at',h.proof_received_at,'proof_approved_at',h.proof_approved_at,
    'active_creative_id',active_creative,'is_current',(active_creative=h.creative_id),
    'provider_mutation_enabled',false,'provider_contract_status',case when h.provider_contract_version is null then 'pending' else 'configured' end
  );
end $$;

create or replace function public.marketing_prepare_pcm_studio_handoff(p_campaign_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  uid uuid:=auth.uid(); camp public.marketing_campaigns%rowtype; cr public.marketing_creatives%rowtype; va public.marketing_intelligence_visual_assets%rowtype;
  brand public.marketing_brand_profiles%rowtype; active_creative uuid; asset_id uuid; package jsonb; hash text; existing public.marketing_pcm_studio_handoffs%rowtype; hid uuid;
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  select * into camp from public.marketing_campaigns where id=p_campaign_id and user_id=uid for update;
  if camp.id is null then raise exception 'Campaign not found'; end if;
  if coalesce(camp.settings#>>'{direct_mail,creative_source}','')<>'watchdog_studio_visual' then raise exception 'Choose a Watchdog Studio visual before preparing the PCM handoff'; end if;
  begin active_creative:=nullif(camp.settings#>>'{direct_mail,active_creative_id}','')::uuid; exception when others then active_creative:=null; end;
  if active_creative is null then raise exception 'Active Studio creative is missing'; end if;
  select * into cr from public.marketing_creatives where id=active_creative and campaign_id=p_campaign_id and user_id=uid and channel='direct_mail';
  if cr.id is null then raise exception 'Active Studio creative was not found'; end if;
  if cr.status<>'approved' then raise exception 'Approve the Studio creative before preparing the PCM handoff'; end if;
  asset_id:=coalesce(cr.visual_asset_id,nullif(cr.content->>'visual_asset_id','')::uuid);
  if asset_id is null then raise exception 'Selected Studio visual is missing'; end if;
  select * into va from public.marketing_intelligence_visual_assets where id=asset_id and campaign_id=p_campaign_id and user_id=uid;
  if va.id is null or va.status not in ('selected','generated') then raise exception 'Selected Studio visual is not available'; end if;
  if coalesce(va.storage_path,'')='' then raise exception 'Selected Studio visual has no stored artwork'; end if;
  if cr.brand_profile_id is not null then select * into brand from public.marketing_brand_profiles where id=cr.brand_profile_id and user_id=uid; end if;
  if brand.id is null then select * into brand from public.marketing_brand_profiles where user_id=uid order by is_default desc,updated_at desc limit 1; end if;
  package:=jsonb_build_object(
    'campaign',jsonb_build_object('id',camp.id,'name',camp.name,'goal',camp.goal,'profession',camp.profession),
    'creative',jsonb_build_object('id',cr.id,'version',cr.version,'headline',cr.content->>'headline','body',cr.content->>'body','cta',cr.content->>'cta','disclaimer',cr.content->>'disclaimer','mail_class','FirstClass','source','watchdog_studio_visual'),
    'brand',jsonb_build_object('id',brand.id,'name',brand.name,'profile',coalesce(brand.profile,'{}'::jsonb)),
    'format',jsonb_build_object('product_type','postcard','size_label','6 x 8.5','mail_class','FirstClass','mechanical_spec_owner','pcm'),
    'visual',jsonb_build_object('id',va.id,'storage_bucket',va.storage_bucket,'storage_path',va.storage_path,'mime_type',va.mime_type,'width',va.width,'height',va.height,'bytes',va.bytes,'style_preset_key',va.style_preset_key,'prompt_hash',va.prompt_hash,'generator_provider',va.provider,'generator_model',va.model),
    'boundary',jsonb_build_object('provider_key','pcm','provider_mutation_enabled',false,'provider_asset_mapping_contract','pending','watchdog_artwork_state','frozen_candidate','requires_pcm_production_proof',true)
  );
  hash:=encode(digest(package::text,'sha256'),'hex');
  select * into existing from public.marketing_pcm_studio_handoffs where campaign_id=p_campaign_id and user_id=uid and package_hash=hash and status<>'superseded' order by created_at desc limit 1;
  if existing.id is not null then return public.marketing_pcm_studio_handoff_state(p_campaign_id); end if;
  update public.marketing_pcm_studio_handoffs set status='superseded',updated_at=now() where campaign_id=p_campaign_id and user_id=uid and status<>'superseded';
  insert into public.marketing_pcm_studio_handoffs(user_id,campaign_id,creative_id,visual_asset_id,status,creative_snapshot,brand_snapshot,asset_snapshot,package_hash,blocked_reason)
  values(uid,p_campaign_id,cr.id,va.id,'provider_contract_pending',package->'creative',package->'brand',package->'visual',hash,'PCM asset upload / image-slot mapping contract is not yet documented') returning id into hid;
  update public.marketing_intelligence_visual_assets set production_status='awaiting_pcm_mapping',updated_at=now() where id=va.id and user_id=uid;
  update public.marketing_campaigns set settings=jsonb_set(jsonb_set(jsonb_set(coalesce(settings,'{}'::jsonb),'{direct_mail,pcm_handoff_id}',to_jsonb(hid::text),true),'{direct_mail,pcm_handoff_status}',to_jsonb('provider_contract_pending'::text),true),'{direct_mail,pcm_handoff_package_hash}',to_jsonb(hash),true),updated_at=now() where id=p_campaign_id and user_id=uid;
  insert into public.marketing_events(user_id,campaign_id,event_type,source,payload) values(uid,p_campaign_id,'creative.pcm_studio_handoff_prepared','watchdog',jsonb_build_object('handoff_id',hid,'creative_id',cr.id,'visual_asset_id',va.id,'package_hash',hash,'provider_mutation_enabled',false,'blocked_reason','pcm_asset_mapping_contract_pending'));
  return public.marketing_pcm_studio_handoff_state(p_campaign_id);
end $$;

revoke all on function public.marketing_pcm_studio_handoff_state(uuid) from public,anon;
revoke all on function public.marketing_prepare_pcm_studio_handoff(uuid) from public,anon;
grant execute on function public.marketing_pcm_studio_handoff_state(uuid) to authenticated;
grant execute on function public.marketing_prepare_pcm_studio_handoff(uuid) to authenticated;
