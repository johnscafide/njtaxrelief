-- NJW-243 / NJW-238: enforce the documented PCM Dynamic Image + proof-retention
-- boundary without enabling provider mutation, cancellation, payment or live send.
--
-- Provider-confirmed facts used here:
--   * PCM Dynamic Image creates the exact {{DynamicImage}} design variable.
--   * provider image assets must remain available during the production window.
--   * PCM proofing is on demand, so Watchdog must retain its own authoritative copy.
--
-- Browser-observed design metadata remains useful for UX, but it is not sufficient
-- to authorize a production mapping. Mapping requires a fresh service-owned LIVE
-- provider certification. Proof-ready state requires a real private Watchdog archive
-- object, not only a transient PCM URL/reference.

-- Private, service-owned authoritative proof archive. No browser storage policy is
-- created for this bucket, so authenticated/anon clients remain fail-closed.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'marketing-pcm-proofs',
  'marketing-pcm-proofs',
  false,
  26214400,
  array['application/pdf','image/png','image/jpeg']::text[]
)
on conflict (id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

create table if not exists public.marketing_pcm_design_certifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  design_id text not null,
  environment text not null check (environment in ('sandbox','live')),
  dynamic_image_ready boolean not null default false,
  dynamic_image_variable text,
  variable_keys jsonb not null default '[]'::jsonb check (jsonb_typeof(variable_keys)='array'),
  provider_detail_sha256 text not null,
  source text not null default 'pcm_server_design_detail',
  observed_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,design_id,environment),
  check (design_id=btrim(design_id) and length(design_id) between 1 and 120),
  check (provider_detail_sha256 ~ '^[0-9a-f]{64}$'),
  check (
    (dynamic_image_ready=false and dynamic_image_variable is null)
    or
    (dynamic_image_ready=true and dynamic_image_variable='DynamicImage')
  )
);

alter table public.marketing_pcm_design_certifications enable row level security;
revoke all on table public.marketing_pcm_design_certifications from public,anon,authenticated;
grant select,insert,update,delete on table public.marketing_pcm_design_certifications to service_role;

-- Service-owned transition only. A browser cannot manufacture a production
-- certification even though it can refresh provider design details for UX.
create or replace function public.marketing_record_pcm_design_certification(
  p_user_id uuid,
  p_design_id text,
  p_environment text,
  p_variable_keys jsonb,
  p_provider_detail_sha256 text,
  p_valid_for_minutes integer default 1440
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  did text:=btrim(coalesce(p_design_id,''));
  env text:=lower(btrim(coalesce(p_environment,'')));
  keys jsonb:=coalesce(p_variable_keys,'[]'::jsonb);
  detail_hash text:=lower(btrim(coalesce(p_provider_detail_sha256,'')));
  ttl integer:=greatest(5,least(coalesce(p_valid_for_minutes,1440),1440));
  dynamic_ready boolean:=false;
  row_id uuid;
begin
  if p_user_id is null then raise exception 'PCM design certification requires a user'; end if;
  if length(did)<1 or length(did)>120 then raise exception 'Invalid PCM design ID'; end if;
  if env not in ('sandbox','live') then raise exception 'PCM certification environment must be sandbox or live'; end if;
  if jsonb_typeof(keys)<>'array' then raise exception 'PCM provider variable keys must be an array'; end if;
  if length(keys::text)>12000 then raise exception 'PCM provider variable key state is too large'; end if;
  if detail_hash !~ '^[0-9a-f]{64}$' then raise exception 'PCM provider detail hash must be SHA-256 hex'; end if;

  select exists(
    select 1 from jsonb_array_elements_text(keys) as k(value)
    where k.value='DynamicImage'
  ) into dynamic_ready;

  insert into public.marketing_pcm_design_certifications(
    user_id,design_id,environment,dynamic_image_ready,dynamic_image_variable,
    variable_keys,provider_detail_sha256,observed_at,expires_at,updated_at
  ) values(
    p_user_id,did,env,dynamic_ready,case when dynamic_ready then 'DynamicImage' else null end,
    keys,detail_hash,now(),now()+make_interval(mins=>ttl),now()
  )
  on conflict(user_id,design_id,environment) do update
  set dynamic_image_ready=excluded.dynamic_image_ready,
      dynamic_image_variable=excluded.dynamic_image_variable,
      variable_keys=excluded.variable_keys,
      provider_detail_sha256=excluded.provider_detail_sha256,
      observed_at=excluded.observed_at,
      expires_at=excluded.expires_at,
      updated_at=now()
  returning id into row_id;

  return jsonb_build_object(
    'ok',true,
    'certification_id',row_id,
    'design_id',did,
    'environment',env,
    'dynamic_image_ready',dynamic_ready,
    'dynamic_image_variable',case when dynamic_ready then 'DynamicImage' else null end,
    'expires_at',now()+make_interval(mins=>ttl)
  );
end;
$$;
revoke all on function public.marketing_record_pcm_design_certification(uuid,text,text,jsonb,text,integer) from public,anon,authenticated;
grant execute on function public.marketing_record_pcm_design_certification(uuid,text,text,jsonb,text,integer) to service_role;

-- Persist provider-observed DynamicImage metadata for truthful UI/state. This
-- remains browser-observed metadata only; the production mapping RPC below never
-- trusts it as the authorization gate.
create or replace function public.marketing_select_pcm_design(
  p_campaign_id uuid,
  p_design_id text,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  uid uuid:=auth.uid();
  did text:=left(trim(coalesce(p_design_id,'')),120);
  incoming jsonb:=coalesce(p_metadata,'{}'::jsonb);
  current_state jsonb:='{}'::jsonb;
  safe_meta jsonb;
  next_state jsonb;
  product text;
  mail_classes jsonb;
  dynamic_variable text;
  dynamic_ready boolean:=false;
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  if did='' then raise exception 'PCM design ID is required'; end if;
  if jsonb_typeof(incoming)<>'object' then raise exception 'PCM design metadata must be an object'; end if;
  if length(incoming::text)>30000 then raise exception 'PCM design metadata is too large'; end if;

  select coalesce(settings->'pcm_design','{}'::jsonb) into current_state
  from public.marketing_campaigns where id=p_campaign_id and user_id=uid for update;
  if not found then raise exception 'Campaign not found'; end if;

  product:=lower(replace(trim(coalesce(incoming->>'product_type','')),' ','_'));
  if product not in ('postcard','letter','brochure','snap_apart','greeting_card') then product:=null; end if;
  mail_classes:=case when jsonb_typeof(incoming->'mail_classes')='array' then incoming->'mail_classes' else '[]'::jsonb end;
  dynamic_variable:=case when btrim(coalesce(incoming->>'dynamic_image_variable',''))='DynamicImage' then 'DynamicImage' else null end;
  dynamic_ready:=coalesce((incoming->>'dynamic_image_ready')::boolean,false) and dynamic_variable='DynamicImage';

  safe_meta:=jsonb_strip_nulls(jsonb_build_object(
    'name',nullif(left(trim(coalesce(incoming->>'name','')),180),''),
    'type',nullif(left(trim(coalesce(incoming->>'type','')),80),''),
    'product_type',product,
    'size',nullif(left(trim(coalesce(incoming->>'size','')),100),''),
    'orientation',nullif(left(trim(coalesce(incoming->>'orientation','')),60),''),
    'status',nullif(left(trim(coalesce(incoming->>'status','')),80),''),
    'thumbnail_url',nullif(left(trim(coalesce(incoming->>'thumbnail_url','')),1600),''),
    'front_url',nullif(left(trim(coalesce(incoming->>'front_url','')),1600),''),
    'back_url',nullif(left(trim(coalesce(incoming->>'back_url','')),1600),''),
    'proof_url',nullif(left(trim(coalesce(incoming->>'proof_url','')),1600),''),
    'mail_classes',mail_classes,
    'variable_count',case when (incoming->>'variable_count')~'^\d+$' then least((incoming->>'variable_count')::int,100) else null end,
    'provider_editability',nullif(left(trim(coalesce(incoming->>'provider_editability','')),80),''),
    'dynamic_image_ready',dynamic_ready,
    'dynamic_image_variable',case when dynamic_ready then dynamic_variable else null end
  ));

  if coalesce(current_state->>'design_id','')=did then
    next_state:=current_state || jsonb_build_object('design_id',did,'metadata',safe_meta,'selected_at',now());
  else
    next_state:=jsonb_build_object('design_id',did,'metadata',safe_meta,'variables','{}'::jsonb,'proof_review',jsonb_build_object('status','unreviewed'),'selected_at',now());
  end if;

  update public.marketing_campaigns
  set settings=(case when product is not null then
      jsonb_set(jsonb_set(jsonb_set(coalesce(settings,'{}'::jsonb),'{pcm_design}',next_state,true),'{direct_mail,product_type}',to_jsonb(product),true),'{direct_mail,size_label}',to_jsonb(coalesce(nullif(safe_meta->>'size',''),settings#>>'{direct_mail,size_label}','')),true)
    else jsonb_set(coalesce(settings,'{}'::jsonb),'{pcm_design}',next_state,true) end),
      updated_at=now()
  where id=p_campaign_id and user_id=uid;

  insert into public.marketing_events(user_id,campaign_id,event_type,source,payload)
  values(uid,p_campaign_id,'creative.pcm_design_selected','pcm',jsonb_build_object('design_id',did,'product_type',product,'metadata',safe_meta));
  return next_state;
end;
$$;
revoke all on function public.marketing_select_pcm_design(uuid,text,jsonb) from public,anon;
grant execute on function public.marketing_select_pcm_design(uuid,text,jsonb) to authenticated,service_role;

-- A Watchdog Studio visual can become mapped_to_pcm only after the exact design
-- has a fresh service-owned LIVE certification proving that PCM returned
-- {{DynamicImage}}. A sandbox/browser observation can never satisfy this gate.
create or replace function public.marketing_record_wdd_provider_mapping(
  p_handoff_id uuid,
  p_provider_design_id text,
  p_provider_contract_version text default 'wdd-provider-mapping-v1'
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  h public.marketing_pcm_studio_handoffs%rowtype;
  cr public.marketing_creatives%rowtype;
  camp public.marketing_campaigns%rowtype;
  cert public.marketing_pcm_design_certifications%rowtype;
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
  if coalesce(camp.settings#>>'{pcm_design,design_id}','') <> design_id then
    raise exception 'Mapped provider design must match the campaign current PCM design';
  end if;

  select * into cert
  from public.marketing_pcm_design_certifications
  where user_id=h.user_id
    and design_id=design_id
    and environment='live'
    and dynamic_image_ready=true
    and dynamic_image_variable='DynamicImage'
    and expires_at>now()
  order by observed_at desc
  limit 1;
  if cert.id is null then
    raise exception 'PCM live design certification with exact DynamicImage is required before provider mapping';
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
  values(h.user_id,h.campaign_id,'creative.wdd_provider_mapped','watchdog_designs',jsonb_build_object(
    'handoff_id',h.id,
    'creative_id',h.creative_id,
    'provider_design_id',design_id,
    'provider_contract_version',contract_version,
    'pcm_design_certification_id',cert.id,
    'pcm_design_certification_environment',cert.environment,
    'provider_mutation_enabled',false
  ));

  return jsonb_build_object('ok',true,'idempotent',false,'handoff_id',h.id,'status','mapped_to_pcm','provider_design_id',design_id,'provider_contract_version',contract_version,'pcm_design_certification_id',cert.id);
end;
$$;
revoke all on function public.marketing_record_wdd_provider_mapping(uuid,text,text) from public,anon,authenticated;
grant execute on function public.marketing_record_wdd_provider_mapping(uuid,text,text) to service_role;

-- Provider proof metadata may include a transient PCM URL, but it is not allowed to
-- unlock proof_ready until the exact proof has been archived privately by Watchdog.
create or replace function public.marketing_record_wdd_provider_proof(
  p_handoff_id uuid,
  p_provider_design_id text,
  p_proof jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public,storage
as $$
declare
  h public.marketing_pcm_studio_handoffs%rowtype;
  proof_size integer;
  design_id text := btrim(coalesce(p_provider_design_id,''));
  archive_bucket text:=btrim(coalesce(p_proof->>'archive_bucket',''));
  archive_path text:=btrim(coalesce(p_proof->>'archive_path',''));
  archive_sha256 text:=lower(btrim(coalesce(p_proof->>'archive_sha256','')));
  archive_mime text:=lower(btrim(coalesce(p_proof->>'archive_mime_type','')));
  archive_object uuid;
  archive_bytes bigint;
begin
  if jsonb_typeof(p_proof) is distinct from 'object' then raise exception 'Provider proof metadata must be an object'; end if;
  proof_size:=length(p_proof::text);
  if proof_size < 2 or proof_size > 12000 then raise exception 'Provider proof metadata is outside the allowed size'; end if;
  if p_proof ?| array['payment','payment_method','order','order_id','postage','recipients','mailing_list'] then
    raise exception 'Provider proof payload contains fields outside the proof boundary';
  end if;
  if archive_bucket <> 'marketing-pcm-proofs' then raise exception 'Authoritative PCM proof must be stored in the private Watchdog proof archive'; end if;
  if archive_path='' or length(archive_path)>1000 or archive_path like '/%' or archive_path ~ '(^|/)\.\.?(/|$)' then
    raise exception 'Invalid PCM proof archive path';
  end if;
  if archive_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'Authoritative PCM proof archive requires SHA-256'; end if;
  if archive_mime not in ('application/pdf','image/png','image/jpeg') then raise exception 'Unsupported PCM proof archive MIME type'; end if;

  select o.id,
         case when coalesce(o.metadata->>'size','') ~ '^\d+$' then (o.metadata->>'size')::bigint else null end
  into archive_object,archive_bytes
  from storage.objects o
  where o.bucket_id=archive_bucket
    and o.name=archive_path
    and coalesce(o.is_delete_marker,false)=false
    and o.archived_at is null
    and lower(coalesce(o.metadata->>'mimetype',''))=archive_mime
  order by o.created_at desc
  limit 1;
  if archive_object is null or coalesce(archive_bytes,0)<=0 then
    raise exception 'Authoritative PCM proof archive object does not exist or is empty';
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
  values(h.user_id,h.campaign_id,'creative.wdd_provider_proof_received','watchdog_designs',jsonb_build_object(
    'handoff_id',h.id,
    'creative_id',h.creative_id,
    'provider_design_id',design_id,
    'proof_metadata_bytes',proof_size,
    'proof_archive_bucket',archive_bucket,
    'proof_archive_path',archive_path,
    'proof_archive_sha256',archive_sha256,
    'proof_archive_bytes',archive_bytes,
    'proof_storage_object_id',archive_object,
    'proof_auto_approved',false,
    'provider_mutation_enabled',false
  ));

  return jsonb_build_object(
    'ok',true,
    'idempotent',false,
    'handoff_id',h.id,
    'status','proof_ready',
    'provider_design_id',design_id,
    'proof_received_at',now(),
    'proof_archive_bucket',archive_bucket,
    'proof_archive_path',archive_path,
    'proof_archive_sha256',archive_sha256,
    'proof_archive_bytes',archive_bytes,
    'proof_auto_approved',false
  );
end;
$$;
revoke all on function public.marketing_record_wdd_provider_proof(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.marketing_record_wdd_provider_proof(uuid,text,jsonb) to service_role;
