-- Watchdog Designs provider mapping/proof transition contract v1.
-- This migration intentionally does not create orders, purchase postage, submit mail, or approve proofs.

revoke insert, update, delete, truncate on table public.marketing_pcm_studio_handoffs from anon, authenticated;

drop function if exists public.marketing_record_wdd_provider_mapping(uuid,text,text);
create function public.marketing_record_wdd_provider_mapping(
  p_handoff_id uuid,
  p_provider_design_id text,
  p_provider_contract_version text default 'wdd-provider-mapping-v1'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  h public.marketing_pcm_studio_handoffs%rowtype;
  cr public.marketing_creatives%rowtype;
  camp public.marketing_campaigns%rowtype;
  active_creative uuid;
  design_id text := btrim(coalesce(p_provider_design_id,''));
  contract_version text := btrim(coalesce(p_provider_contract_version,''));
begin
  if length(design_id) < 3 or length(design_id) > 200 then raise exception 'Invalid provider design id'; end if;
  if length(contract_version) < 3 or length(contract_version) > 120 then raise exception 'Invalid provider contract version'; end if;

  select * into h from public.marketing_pcm_studio_handoffs where id=p_handoff_id for update;
  if h.id is null then raise exception 'Handoff not found'; end if;
  if h.provider_key <> 'pcm' or h.product_type <> 'postcard' or h.size_label <> '6 x 8.5' or h.mail_class <> 'FirstClass' then
    raise exception 'Handoff mechanical specification is not eligible for Watchdog Designs mapping';
  end if;

  select * into cr from public.marketing_creatives where id=h.creative_id and campaign_id=h.campaign_id and user_id=h.user_id;
  if cr.id is null or cr.status <> 'approved' then raise exception 'Source creative is not frozen and approved'; end if;
  select * into camp from public.marketing_campaigns where id=h.campaign_id and user_id=h.user_id;
  if camp.id is null then raise exception 'Campaign not found'; end if;
  begin active_creative:=nullif(camp.settings#>>'{direct_mail,active_creative_id}','')::uuid; exception when others then active_creative:=null; end;
  if active_creative is distinct from h.creative_id or coalesce(camp.settings#>>'{direct_mail,creative_source}','') <> 'watchdog_studio_visual' then
    raise exception 'Handoff no longer matches the active frozen Watchdog Studio creative';
  end if;

  if h.status='mapped_to_pcm' and h.provider_design_id=design_id and h.provider_contract_version=contract_version then
    return jsonb_build_object('ok',true,'idempotent',true,'handoff_id',h.id,'status',h.status,'provider_design_id',h.provider_design_id,'provider_contract_version',h.provider_contract_version);
  end if;
  if h.status <> 'provider_contract_pending' then raise exception 'Handoff is not eligible for provider mapping from status %', h.status; end if;

  update public.marketing_pcm_studio_handoffs
  set status='mapped_to_pcm', provider_design_id=design_id, provider_contract_version=contract_version,
      mapped_at=coalesce(mapped_at,now()), blocked_reason=null, updated_at=now()
  where id=h.id;

  update public.marketing_campaigns
  set settings=jsonb_set(jsonb_set(coalesce(settings,'{}'::jsonb),'{direct_mail,pcm_handoff_status}',to_jsonb('mapped_to_pcm'::text),true),'{direct_mail,pcm_provider_design_id}',to_jsonb(design_id),true),updated_at=now()
  where id=h.campaign_id and user_id=h.user_id;

  insert into public.marketing_events(user_id,campaign_id,event_type,source,payload)
  values(h.user_id,h.campaign_id,'creative.wdd_provider_mapped','watchdog_designs',jsonb_build_object('handoff_id',h.id,'creative_id',h.creative_id,'provider_design_id',design_id,'provider_contract_version',contract_version,'provider_mutation_enabled',false));

  return jsonb_build_object('ok',true,'idempotent',false,'handoff_id',h.id,'status','mapped_to_pcm','provider_design_id',design_id,'provider_contract_version',contract_version);
end;
$$;

revoke all on function public.marketing_record_wdd_provider_mapping(uuid,text,text) from public, anon, authenticated;
grant execute on function public.marketing_record_wdd_provider_mapping(uuid,text,text) to service_role;

drop function if exists public.marketing_record_wdd_provider_proof(uuid,text,jsonb);
create function public.marketing_record_wdd_provider_proof(
  p_handoff_id uuid,
  p_provider_design_id text,
  p_proof jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  h public.marketing_pcm_studio_handoffs%rowtype;
  proof_size integer;
  design_id text := btrim(coalesce(p_provider_design_id,''));
begin
  if jsonb_typeof(p_proof) is distinct from 'object' then raise exception 'Provider proof metadata must be an object'; end if;
  proof_size:=length(p_proof::text);
  if proof_size < 2 or proof_size > 12000 then raise exception 'Provider proof metadata is outside the allowed size'; end if;
  if p_proof ?| array['payment','payment_method','order','order_id','postage','recipients','mailing_list'] then
    raise exception 'Provider proof payload contains fields outside the proof boundary';
  end if;
  if coalesce(nullif(btrim(p_proof->>'proof_url'),''),nullif(btrim(p_proof->>'url'),''),nullif(btrim(p_proof->>'asset_url'),''),nullif(btrim(p_proof->>'reference'),''),nullif(btrim(p_proof->>'id'),''),nullif(btrim(p_proof->>'hash'),'')) is null then
    raise exception 'Provider proof metadata requires a stable proof reference';
  end if;

  select * into h from public.marketing_pcm_studio_handoffs where id=p_handoff_id for update;
  if h.id is null then raise exception 'Handoff not found'; end if;
  if h.status='proof_ready' and h.provider_design_id=design_id and h.provider_proof=p_proof then
    return jsonb_build_object('ok',true,'idempotent',true,'handoff_id',h.id,'status',h.status,'provider_design_id',h.provider_design_id,'proof_received_at',h.proof_received_at);
  end if;
  if h.status <> 'mapped_to_pcm' then raise exception 'Provider proof is only accepted after a successful mapping'; end if;
  if h.provider_design_id is null or h.provider_design_id <> design_id then raise exception 'Provider design id does not match the mapped handoff'; end if;
  if h.provider_contract_version is null then raise exception 'Provider mapping contract is missing'; end if;

  update public.marketing_pcm_studio_handoffs
  set status='proof_ready', provider_proof=p_proof, proof_received_at=coalesce(proof_received_at,now()), updated_at=now()
  where id=h.id;

  update public.marketing_campaigns
  set settings=jsonb_set(coalesce(settings,'{}'::jsonb),'{direct_mail,pcm_handoff_status}',to_jsonb('proof_ready'::text),true),updated_at=now()
  where id=h.campaign_id and user_id=h.user_id;

  insert into public.marketing_events(user_id,campaign_id,event_type,source,payload)
  values(h.user_id,h.campaign_id,'creative.wdd_provider_proof_received','watchdog_designs',jsonb_build_object('handoff_id',h.id,'creative_id',h.creative_id,'provider_design_id',design_id,'proof_metadata_bytes',proof_size,'proof_auto_approved',false,'provider_mutation_enabled',false));

  return jsonb_build_object('ok',true,'idempotent',false,'handoff_id',h.id,'status','proof_ready','provider_design_id',design_id,'proof_received_at',now(),'proof_auto_approved',false);
end;
$$;

revoke all on function public.marketing_record_wdd_provider_proof(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.marketing_record_wdd_provider_proof(uuid,text,jsonb) to service_role;
