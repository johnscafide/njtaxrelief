-- NJW-236 follow-up: persist the production-tested proof-reference digest fixes
-- and Property Passport v0.1 contract without rewriting the original migration.

create or replace function public.integration_create_automation_proof_reference(
  p_proof_id uuid,
  p_disclosure_scope text default 'external_minimal'::text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_proof public.integration_automation_proofs%rowtype;
  v_ref public.integration_automation_proof_references%rowtype;
  v_scope text:=coalesce(nullif(trim(p_disclosure_scope),''),'external_minimal');
  v_digest text;
  v_approval_status text;
  v_safe jsonb;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if not public.integration_automation_entitled() then raise exception 'Automation proofs require Pro+ or Teams' using errcode='42501'; end if;
  if v_scope not in ('external_minimal','watchdog_internal') then raise exception 'Invalid proof disclosure scope' using errcode='23514'; end if;

  select * into v_proof
  from public.integration_automation_proofs
  where id=p_proof_id and user_id=v_user;
  if not found then raise exception 'Proof not found' using errcode='P0002'; end if;

  v_digest:=encode(extensions.digest(v_proof.envelope::text,'sha256'::text),'hex');

  insert into public.integration_automation_proof_references(
    user_id,proof_id,proof_reference,proof_digest,disclosure_scope
  ) values (
    v_user,v_proof.id,'wdp_'||replace(gen_random_uuid()::text,'-',''),v_digest,v_scope
  ) on conflict(user_id,proof_id,disclosure_scope) do nothing;

  select * into v_ref
  from public.integration_automation_proof_references
  where user_id=v_user and proof_id=v_proof.id and disclosure_scope=v_scope;

  select a.status into v_approval_status
  from public.integration_automation_approvals a
  where a.user_id=v_user and a.proof_id=v_proof.id
  order by a.requested_at desc limit 1;

  if v_scope='external_minimal' then
    v_safe:=jsonb_strip_nulls(jsonb_build_object(
      'schema_version','watchdog-proof-ref/v1',
      'proof_reference',v_ref.proof_reference,
      'proof_digest',v_ref.proof_digest,
      'property',jsonb_build_object(
        'pams_pin',v_proof.envelope#>>'{property,pams_pin}'
      ),
      'event',jsonb_build_object(
        'type',v_proof.envelope#>>'{event,type}',
        'occurred_at',v_proof.envelope#>>'{event,occurred_at}'
      ),
      'intelligence',jsonb_build_object(
        'opportunity_type',v_proof.envelope#>>'{intelligence,opportunity_type}',
        'score',v_proof.envelope#>>'{intelligence,score}',
        'confidence',v_proof.envelope#>>'{intelligence,confidence}',
        'evidence_coverage',v_proof.envelope#>>'{intelligence,evidence_coverage}',
        'model_key',v_proof.envelope#>>'{intelligence,model_key}',
        'model_version',v_proof.envelope#>>'{intelligence,model_version}'
      ),
      'evidence',jsonb_build_object(
        'count',v_proof.envelope#>>'{evidence,count}',
        'governed_available_ratio',v_proof.envelope#>>'{evidence,governed_available_ratio}',
        'newest_observed_at',v_proof.envelope#>>'{evidence,newest_observed_at}'
      ),
      'policy',jsonb_build_object(
        'policy_group_id',v_proof.envelope#>>'{policy,policy_group_id}',
        'version',v_proof.envelope#>>'{policy,version}',
        'result',v_proof.envelope#>>'{policy,result}',
        'reasons',v_proof.envelope#>'{policy,reasons}',
        'required_approval',v_proof.envelope#>>'{policy,required_approval}'
      ),
      'relationship',jsonb_build_object(
        'status',v_proof.envelope#>>'{relationship,status}',
        'link_method',v_proof.envelope#>>'{relationship,link_method}',
        'verified_at',v_proof.envelope#>>'{relationship,verified_at}'
      ),
      'approval_status',v_approval_status,
      'execution_allowed',false
    ));
  else
    v_safe:=jsonb_build_object(
      'schema_version','watchdog-proof-ref/v1',
      'proof_reference',v_ref.proof_reference,
      'proof_digest',v_ref.proof_digest,
      'proof_id',v_proof.id,
      'envelope',v_proof.envelope,
      'approval_status',v_approval_status,
      'execution_allowed',false
    );
  end if;

  insert into public.integration_audit_log(user_id,connection_id,action,actor,details)
  values(v_user,null,'automation.proof_reference.created','user',jsonb_build_object(
    'proof_id',v_proof.id,
    'proof_reference',v_ref.proof_reference,
    'disclosure_scope',v_scope,
    'proof_digest',v_ref.proof_digest
  ));

  return v_safe;
end;
$$;

create or replace function public.integration_reconstruct_automation_proof(p_proof_reference text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_ref public.integration_automation_proof_references%rowtype;
  v_proof public.integration_automation_proofs%rowtype;
  v_current_digest text;
  v_approvals jsonb;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if not public.integration_automation_entitled() then raise exception 'Automation proof reconstruction requires Pro+ or Teams' using errcode='42501'; end if;

  select * into v_ref
  from public.integration_automation_proof_references
  where user_id=v_user
    and proof_reference=left(trim(coalesce(p_proof_reference,'')),80);
  if not found then raise exception 'Proof reference not found' using errcode='P0002'; end if;

  select * into v_proof
  from public.integration_automation_proofs
  where id=v_ref.proof_id and user_id=v_user;
  if not found then raise exception 'Proof not found' using errcode='P0002'; end if;

  v_current_digest:=encode(extensions.digest(v_proof.envelope::text,'sha256'::text),'hex');

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id',a.id,
    'status',a.status,
    'requested_at',a.requested_at,
    'expires_at',a.expires_at,
    'decided_at',a.decided_at,
    'decision_note',a.decision_note,
    'execution_allowed',a.execution_allowed
  )) order by a.requested_at),'[]'::jsonb)
  into v_approvals
  from public.integration_automation_approvals a
  where a.user_id=v_user and a.proof_id=v_proof.id;

  return jsonb_build_object(
    'schema_version','watchdog-proof-reconstruction/v1',
    'proof_reference',v_ref.proof_reference,
    'proof_id',v_proof.id,
    'proof_digest',v_ref.proof_digest,
    'digest_valid',v_ref.proof_digest=v_current_digest,
    'disclosure_scope',v_ref.disclosure_scope,
    'envelope',v_proof.envelope,
    'approvals',v_approvals,
    'execution_allowed',false
  );
end;
$$;

create or replace function public.integration_get_property_passport(p_pams_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, watchdog_warehouse, pg_temp
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
  if v_pin is null or length(v_pin)>80 or v_pin !~ '^[A-Za-z0-9._:-]+$' then
    raise exception 'A valid exact PAMS PIN is required' using errcode='23514';
  end if;

  v_passport_id:='wdp_prop_'||substr(encode(extensions.digest(v_pin,'sha256'::text),'hex'),1,24);

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
    select nullif(trim(pl.block),'') block,nullif(trim(pl.lot),'') lot,nullif(trim(pl.qualifier),'') qualifier
    from public.property_lookups pl where pl.pams_pin=v_pin
    union all
    select nullif(trim(sp.block),'') block,nullif(trim(sp.lot),'') lot,null::text qualifier
    from public.saved_properties sp where sp.user_id=v_user and sp.pams_pin=v_pin
  )
  select count(distinct concat_ws('|',coalesce(block,''),coalesce(lot,''),coalesce(qualifier,'')))
         filter(where block is not null or lot is not null or qualifier is not null)
  into v_distinct_parcels from parcel_rows;

  select pl.address,pl.town,pl.county,pl.zip,pl.block,pl.lot,pl.qualifier
  into v_canonical_address,v_town,v_county,v_zip,v_block,v_lot,v_qualifier
  from public.property_lookups pl where pl.pams_pin=v_pin limit 1;

  if v_canonical_address is null and v_distinct_addresses<=1 then
    select sp.address,sp.town,sp.county,sp.zip,sp.block,sp.lot
    into v_canonical_address,v_town,v_county,v_zip,v_block,v_lot
    from public.saved_properties sp
    where sp.user_id=v_user and sp.pams_pin=v_pin
    order by sp.verified desc,sp.updated_at desc limit 1;
  end if;

  if v_canonical_address is null and v_distinct_addresses<=1 then
    select f.property_address into v_canonical_address
    from public.intelligence_findings f
    where f.user_id=v_user and f.pams_pin=v_pin and f.property_address is not null
    order by f.created_at desc limit 1;
  end if;

  select count(*)::int into v_verified_crm
  from public.integration_crm_property_links l
  where l.user_id=v_user and l.pams_pin=v_pin and l.status='verified' and l.verified_at is not null;

  select count(*)::int into v_verified_ownership
  from public.ownership_verifications ov
  where ov.user_id=v_user and ov.pams_pin=v_pin and ov.status='verified' and ov.verified_at is not null;

  select count(*)::int into v_proof_count
  from public.integration_automation_proofs ap
  where ap.user_id=v_user and ap.pams_pin=v_pin;

  select coalesce(jsonb_agg(distinct jsonb_build_object(
    'provider',ov.provider,'provider_id',ov.provider_id,'verified_at',ov.verified_at
  )) filter(where ov.provider is not null),'[]'::jsonb)
  into v_provider_refs
  from public.ownership_verifications ov
  where ov.user_id=v_user and ov.pams_pin=v_pin and ov.status='verified';

  select coalesce(jsonb_agg(distinct jsonb_build_object(
    'link_method',l.link_method,'verified_at',l.verified_at
  )),'[]'::jsonb)
  into v_relationship_methods
  from public.integration_crm_property_links l
  where l.user_id=v_user and l.pams_pin=v_pin and l.status='verified' and l.verified_at is not null;

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
    'canonical',jsonb_build_object(
      'pams_pin',v_pin,'address',v_canonical_address,'town',v_town,'county',v_county,
      'zip',v_zip,'block',v_block,'lot',v_lot,'qualifier',v_qualifier
    ),
    'identity_evidence',jsonb_build_object(
      'exact_source_classes',v_exact_sources,
      'distinct_normalized_addresses',v_distinct_addresses,
      'distinct_block_lot_qualifiers',v_distinct_parcels,
      'observed_address_aliases',v_address_aliases,
      'historical_aliases',jsonb_build_array(),
      'historical_aliases_status','not_governed_yet',
      'provider_refs',v_provider_refs
    ),
    'relationships',jsonb_build_object(
      'verified_crm_relationships',v_verified_crm,
      'verified_ownership_relationships',v_verified_ownership,
      'methods',v_relationship_methods
    ),
    'automation_proofs',jsonb_build_object('count',v_proof_count),
    'rules',jsonb_build_object(
      'canonical_key','pams_pin',
      'exact_pams_required',true,
      'fuzzy_address_resolution',false,
      'person_name_matching',false,
      'crm_address_can_be_canonical',false,
      'ambiguous_identity_fails_closed',true,
      'unresolved_identity_fails_closed',true,
      'unit_or_qualifier_conflict_fails_closed',true
    ),
    'execution_allowed',false
  ));
end;
$$;

revoke all on function public.integration_create_automation_proof_reference(uuid,text) from public,anon;
revoke all on function public.integration_reconstruct_automation_proof(text) from public,anon;
revoke all on function public.integration_get_property_passport(text) from public,anon;
grant execute on function public.integration_create_automation_proof_reference(uuid,text) to authenticated;
grant execute on function public.integration_reconstruct_automation_proof(text) to authenticated;
grant execute on function public.integration_get_property_passport(text) to authenticated;
