-- Keep fresh environments aligned with the production-safe DynamicImage metadata parser.
-- Malformed browser metadata must resolve to false rather than raising a boolean cast error.
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
  dynamic_ready:=case when lower(btrim(coalesce(incoming->>'dynamic_image_ready','')))='true' then true else false end
                 and dynamic_variable='DynamicImage';

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
