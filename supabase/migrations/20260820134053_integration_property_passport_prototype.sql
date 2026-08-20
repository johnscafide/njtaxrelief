create or replace function public.integration_get_property_passport(p_pams_pin text)
returns jsonb
language plpgsql
security definer
set search_path=public,private,watchdog_warehouse,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_pin text:=nullif(trim(coalesce(p_pams_pin,'')),'');
  v_passport_id text;
  v_exact_sources integer:=0;
  v_distinct_addresses integer:=0;
  v_distinct_parcels integer:=0;
  v_canonical_address text;
  v_town text;
  v_county text;
  v_zip text;
  v_block text;
  v_lot text;
  v_qualifier text;
  v_identity_status text;
  v_verified_crm integer:=0;
  v_verified_ownership integer:=0;
  v_proof_count integer:=0;
  v_address_aliases jsonb:='[]'::jsonb;
  v_provider_refs jsonb:='[]'::jsonb;
  v_relationship_methods jsonb:='[]'::jsonb;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if not public.integration_automation_entitled() then raise exception 'Property Passport requires Pro+ or Teams' using errcode='42501'; end if;
  if v_pin is null or length(v_pin)>80 or v_pin !~ '^[A-Za-z0-9._:-]+$' then raise exception 'A valid exact PAMS PIN is required' using errcode='23514'; end if;

  v_passport_id:='wdp_prop_'||substr(encode(extensions.digest(convert_to(v_pin,'UTF8'),'sha256'),'hex'),1,24);

  select
    (case when exists(select 1 from public.property_lookups pl where pl.pams_pin=v_pin) then 1 else 0 end)+
    (case when exists(select 1 from public.saved_properties sp where sp.user_id=v_user and sp.pams_pin=v_pin) then 1 else 0 end)+
    (case when exists(select 1 from public.intelligence_findings f where f.user_id=v_user and f.pams_pin=v_pin) then 1 else 0 end)+
    (case when exists(select 1 from public.integration_crm_property_links l where l.user_id=v_user and l.pams_pin=v_pin and l.status='verified') then 1 else 0 end)+
    (case when exists(select 1 from public.integration_automation_proofs ap where ap.user_id=v_user and ap.pams_pin=v_pin) then 1 else 0 end)+
    (case when exists(select 1 from public.ownership_verifications ov where ov.user_id=v_user and ov.pams_pin=v_pin and ov.status='verified') then 1 else 0 end)
  into v_exact_sources;

  with address_rows as (
    select 'property_lookup'::text source,pl.address from public.property_lookups pl where pl.pams_pin=v_pin
    union all
    select 'saved_property',sp.address from public.saved_properties sp where sp.user_id=v_user and sp.pams_pin=v_pin
    union all
    select 'intelligence_finding',f.property_address from public.intelligence_findings f where f.user_id=v_user and f.pams_pin=v_pin and f.property_address is not null
  ), norm as (
    select source,address,regexp_replace(upper(trim(address)),'[^A-Z0-9]+',' ','g') normalized
    from address_rows where nullif(trim(address),'') is not null
  )
  select count(distinct normalized),
         coalesce(jsonb_agg(distinct jsonb_build_object('source',source,'address',address)) filter(where address is not null),'[]'::jsonb)
  into v_distinct_addresses,v_address_aliases
  from norm;

  with parcel_rows as (
    select nullif(trim(pl.block),'') block,nullif(trim(pl.lot),'') lot,nullif(trim(pl.qualifier),'') qualifier from public.property_lookups pl where pl.pams_pin=v_pin
    union all
    select nullif(trim(sp.block),'') block,nullif(trim(sp.lot),'') lot,null::text qualifier from public.saved_properties sp where sp.user_id=v_user and sp.pams_pin=v_pin
  )
  select count(distinct concat_ws('|',coalesce(block,''),coalesce(lot,''),coalesce(qualifier,''))) filter(where block is not null or lot is not null or qualifier is not null)
  into v_distinct_parcels from parcel_rows;

  select pl.address,pl.town,pl.county,pl.zip,pl.block,pl.lot,pl.qualifier
  into v_canonical_address,v_town,v_county,v_zip,v_block,v_lot,v_qualifier
  from public.property_lookups pl where pl.pams_pin=v_pin limit 1;

  if v_canonical_address is null and v_distinct_addresses<=1 then
    select sp.address,sp.town,sp.county,sp.zip,sp.block,sp.lot
    into v_canonical_address,v_town,v_county,v_zip,v_block,v_lot
    from public.saved_properties sp where sp.user_id=v_user and sp.pams_pin=v_pin
    order by sp.verified desc,sp.updated_at desc limit 1;
  end if;
  if v_canonical_address is null and v_distinct_addresses<=1 then
    select f.property_address into v_canonical_address from public.intelligence_findings f
    where f.user_id=v_user and f.pams_pin=v_pin and f.property_address is not null
    order by f.created_at desc limit 1;
  end if;

  select count(*)::int into v_verified_crm from public.integration_crm_property_links l where l.user_id=v_user and l.pams_pin=v_pin and l.status='verified' and l.verified_at is not null;
  select count(*)::int into v_verified_ownership from public.ownership_verifications ov where ov.user_id=v_user and ov.pams_pin=v_pin and ov.status='verified' and ov.verified_at is not null;
  select count(*)::int into v_proof_count from public.integration_automation_proofs ap where ap.user_id=v_user and ap.pams_pin=v_pin;

  select coalesce(jsonb_agg(distinct jsonb_build_object('provider',ov.provider,'provider_id',ov.provider_id,'verified_at',ov.verified_at)) filter(where ov.provider is not null),'[]'::jsonb)
  into v_provider_refs from public.ownership_verifications ov where ov.user_id=v_user and ov.pams_pin=v_pin and ov.status='verified';
  select coalesce(jsonb_agg(distinct jsonb_build_object('link_method',l.link_method,'verified_at',l.verified_at)),'[]'::jsonb)
  into v_relationship_methods from public.integration_crm_property_links l where l.user_id=v_user and l.pams_pin=v_pin and l.status='verified' and l.verified_at is not null;

  v_identity_status:=case
    when v_exact_sources=0 then 'unresolved'
    when v_distinct_addresses>1 or v_distinct_parcels>1 then 'ambiguous'
    else 'resolved'
  end;

  return jsonb_strip_nulls(jsonb_build_object(
    'schema_version','watchdog-property-passport/v0.1',
    'passport_id',v_passport_id,
    'identity_status',v_identity_status,
    'identity_usable_for_policy',(v_identity_status='resolved'),
    'canonical',jsonb_build_object('pams_pin',v_pin,'address',v_canonical_address,'town',v_town,'county',v_county,'zip',v_zip,'block',v_block,'lot',v_lot,'qualifier',v_qualifier),
    'identity_evidence',jsonb_build_object('exact_source_classes',v_exact_sources,'distinct_normalized_addresses',v_distinct_addresses,'distinct_block_lot_qualifiers',v_distinct_parcels,'observed_address_aliases',v_address_aliases,'historical_aliases',jsonb_build_array(),'historical_aliases_status','not_governed_yet','provider_refs',v_provider_refs),
    'relationships',jsonb_build_object('verified_crm_relationships',v_verified_crm,'verified_ownership_relationships',v_verified_ownership,'methods',v_relationship_methods),
    'automation_proofs',jsonb_build_object('count',v_proof_count),
    'rules',jsonb_build_object('canonical_key','pams_pin','exact_pams_required',true,'fuzzy_address_resolution',false,'person_name_matching',false,'crm_address_can_be_canonical',false,'ambiguous_identity_fails_closed',true,'unresolved_identity_fails_closed',true,'unit_or_qualifier_conflict_fails_closed',true),
    'execution_allowed',false
  ));
end; $$;

revoke execute on function public.integration_get_property_passport(text) from public,anon;
grant execute on function public.integration_get_property_passport(text) to authenticated;
