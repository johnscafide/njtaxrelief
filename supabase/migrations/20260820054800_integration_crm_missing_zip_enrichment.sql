-- CRM property resolution: governed missing-ZIP enrichment and shadow acceptance harness.
-- Production behavior remains candidate-only. No address-derived rule auto-verifies a CRM relationship.

create or replace function public.integration_normalize_street_v1(p_value text)
returns text
language sql
immutable
set search_path = public, pg_catalog
as $$
with cleaned as (
  select trim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          replace(upper(coalesce(p_value,'')), '&', ' AND '),
          '[.,'']', ' ', 'g'),
        '#', ' UNIT ', 'g'),
      '\m(APARTMENT|APT|UNIT|STE|SUITE)\M', ' UNIT ', 'g'),
    '[^A-Z0-9-]+', ' ', 'g')) as s
), tokens as (
  select ord,
         case tok
           when 'STREET' then 'ST' when 'ST' then 'ST'
           when 'AVENUE' then 'AVE' when 'AVE' then 'AVE'
           when 'ROAD' then 'RD' when 'RD' then 'RD'
           when 'DRIVE' then 'DR' when 'DR' then 'DR'
           when 'LANE' then 'LN' when 'LN' then 'LN'
           when 'COURT' then 'CT' when 'CT' then 'CT'
           when 'BOULEVARD' then 'BLVD' when 'BLVD' then 'BLVD'
           when 'CIRCLE' then 'CIR' when 'CIR' then 'CIR'
           when 'PARKWAY' then 'PKWY' when 'PKWY' then 'PKWY'
           when 'HIGHWAY' then 'HWY' when 'HWY' then 'HWY'
           when 'TERRACE' then 'TER' when 'TER' then 'TER'
           when 'PLACE' then 'PL' when 'PL' then 'PL'
           when 'TRAIL' then 'TRL' when 'TRL' then 'TRL'
           when 'TURNPIKE' then 'TPKE' when 'TPKE' then 'TPKE'
           when 'NORTH' then 'N' when 'SOUTH' then 'S'
           when 'EAST' then 'E' when 'WEST' then 'W'
           else tok
         end as tok
  from cleaned,
       regexp_split_to_table(regexp_replace(s, '\s+', ' ', 'g'), ' ') with ordinality as t(tok,ord)
  where tok <> ''
), joined as (
  select string_agg(tok,' ' order by ord) as s from tokens
)
select trim(regexp_replace(coalesce(s,''), '\mUNIT\s+UNIT\M', 'UNIT', 'g')) from joined;
$$;
revoke all on function public.integration_normalize_street_v1(text) from public, anon, authenticated;
grant execute on function public.integration_normalize_street_v1(text) to service_role;

create table if not exists public.integration_crm_address_enrichment_shadow (
  id uuid primary key default gen_random_uuid(),
  cohort text not null check (cohort in ('gold','missing_zip')),
  crm_context_id uuid not null,
  expected_pams_pin text,
  original_normalized_street text not null,
  known_zip text,
  geocode_request_id bigint unique,
  geocode_status text not null default 'queued',
  geocode_score numeric,
  recovered_zip text,
  geocoded_street text,
  parcel_request_id bigint unique,
  parcel_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.integration_crm_address_enrichment_shadow enable row level security;
revoke all on table public.integration_crm_address_enrichment_shadow from public, anon, authenticated;
grant select, insert, update, delete on table public.integration_crm_address_enrichment_shadow to service_role;
create index if not exists integration_crm_address_shadow_created_idx on public.integration_crm_address_enrichment_shadow(created_at desc);
create index if not exists integration_crm_address_shadow_context_idx on public.integration_crm_address_enrichment_shadow(crm_context_id);

create or replace function public.integration_crm_address_shadow_seed(p_sample_limit integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public, net, pg_catalog
as $$
declare
  r record;
  v_request_id bigint;
  v_gold integer := 0;
  v_sample integer := 0;
  v_limit integer := greatest(1, least(coalesce(p_sample_limit,30),50));
  v_single_line text;
begin
  delete from public.integration_crm_address_enrichment_shadow;
  for r in
    select l.crm_context_id,l.pams_pin,l.crm_property_address,
           l.evidence->>'normalized_address' as normalized_address,
           l.evidence->>'zip' as known_zip
    from public.integration_crm_property_links l
    where l.status='verified'
      and l.evidence->>'match_tier'='human_verified_gold'
      and coalesce(l.crm_property_address,'')<>''
      and coalesce(l.evidence->>'normalized_address','')<>''
  loop
    v_single_line := trim(regexp_replace(regexp_replace(r.crm_property_address, '\m[0-9]{5}(-[0-9]{4})?\M', '', 'g'), '\s+', ' ', 'g'));
    select net.http_get(
      url := 'https://geo.nj.gov/arcgis/rest/services/Tasks/NJ_Geocode/GeocodeServer/findAddressCandidates',
      params := jsonb_build_object('f','json','SingleLine',v_single_line,'outFields','Match_addr,StAddr,City,Region,Postal,Addr_type','maxLocations','3','sourceCountry','USA'),
      headers := jsonb_build_object('accept','application/json'),
      timeout_milliseconds := 15000
    ) into v_request_id;
    insert into public.integration_crm_address_enrichment_shadow(cohort,crm_context_id,expected_pams_pin,original_normalized_street,known_zip,geocode_request_id)
    values ('gold',r.crm_context_id,r.pams_pin,r.normalized_address,r.known_zip,v_request_id);
    v_gold := v_gold + 1;
  end loop;
  for r in
    select s.crm_context_id,s.normalized_address,c.property_address
    from public.integration_crm_resolution_state s
    join public.integration_crm_context c on c.id=s.crm_context_id
    where s.detail_status='no_match'
      and s.normalized_zip is null
      and upper(coalesce(c.context->>'address_state',''))='NJ'
      and coalesce(c.property_address,'')<>''
      and coalesce(s.normalized_address,'')<>''
    order by s.updated_at asc
    limit v_limit
  loop
    v_single_line := trim(regexp_replace(r.property_address, '\s+', ' ', 'g'));
    select net.http_get(
      url := 'https://geo.nj.gov/arcgis/rest/services/Tasks/NJ_Geocode/GeocodeServer/findAddressCandidates',
      params := jsonb_build_object('f','json','SingleLine',v_single_line,'outFields','Match_addr,StAddr,City,Region,Postal,Addr_type','maxLocations','3','sourceCountry','USA'),
      headers := jsonb_build_object('accept','application/json'),
      timeout_milliseconds := 15000
    ) into v_request_id;
    insert into public.integration_crm_address_enrichment_shadow(cohort,crm_context_id,original_normalized_street,geocode_request_id)
    values ('missing_zip',r.crm_context_id,r.normalized_address,v_request_id);
    v_sample := v_sample + 1;
  end loop;
  return jsonb_build_object('gold_queued',v_gold,'missing_zip_queued',v_sample,'sample_limit',v_limit,'mode','shadow_only');
end;
$$;
revoke all on function public.integration_crm_address_shadow_seed(integer) from public, anon, authenticated;
grant execute on function public.integration_crm_address_shadow_seed(integer) to service_role;

create or replace function public.integration_crm_address_shadow_process_geocode()
returns jsonb
language plpgsql
security definer
set search_path = public, net, pg_catalog
as $$
declare
  r record;
  v_content jsonb;
  v_top jsonb;
  v_score numeric;
  v_region text;
  v_postal text;
  v_street text;
  v_norm text;
  v_processed integer := 0;
  v_eligible integer := 0;
begin
  for r in
    select s.*,h.status_code,h.content,h.error_msg,h.timed_out
    from public.integration_crm_address_enrichment_shadow s
    join net._http_response h on h.id=s.geocode_request_id
    where s.geocode_status='queued'
  loop
    v_processed := v_processed + 1;
    if r.status_code <> 200 or coalesce(r.error_msg,'')<>'' or coalesce(r.timed_out,false) then
      update public.integration_crm_address_enrichment_shadow set geocode_status='http_error',updated_at=now() where id=r.id;
      continue;
    end if;
    begin v_content := r.content::jsonb; exception when others then
      update public.integration_crm_address_enrichment_shadow set geocode_status='invalid_json',updated_at=now() where id=r.id;
      continue;
    end;
    v_top := v_content->'candidates'->0;
    if v_top is null then
      update public.integration_crm_address_enrichment_shadow set geocode_status='no_candidate',updated_at=now() where id=r.id;
      continue;
    end if;
    v_score := coalesce((v_top->>'score')::numeric,0);
    v_region := upper(coalesce(v_top->'attributes'->>'Region',''));
    v_postal := substring(coalesce(v_top->'attributes'->>'Postal','') from '([0-9]{5})');
    v_street := coalesce(v_top->'attributes'->>'StAddr','');
    v_norm := public.integration_normalize_street_v1(v_street);
    update public.integration_crm_address_enrichment_shadow
      set geocode_score=v_score,recovered_zip=v_postal,geocoded_street=v_street,
          geocode_status=case
            when v_score < 95 then 'low_score'
            when v_region not in ('NJ','NEW JERSEY') then 'non_nj'
            when coalesce(v_postal,'')='' then 'no_zip'
            when v_norm <> original_normalized_street then 'street_changed'
            when cohort='gold' and coalesce(known_zip,'')<>'' and v_postal<>known_zip then 'gold_zip_mismatch'
            else 'eligible'
          end,
          updated_at=now()
      where id=r.id;
    if v_score >=95 and v_region in ('NJ','NEW JERSEY') and coalesce(v_postal,'')<>'' and v_norm=r.original_normalized_street
       and not (r.cohort='gold' and coalesce(r.known_zip,'')<>'' and v_postal<>r.known_zip) then
      v_eligible := v_eligible + 1;
    end if;
  end loop;
  return jsonb_build_object('geocode_processed',v_processed,'spatial_parcel_eligible',v_eligible);
end;
$$;
revoke all on function public.integration_crm_address_shadow_process_geocode() from public, anon, authenticated;
grant execute on function public.integration_crm_address_shadow_process_geocode() to service_role;

create or replace function public.integration_crm_address_shadow_seed_spatial_parcels()
returns jsonb
language plpgsql
security definer
set search_path = public, net, pg_catalog
as $$
declare
  r record;
  v_content jsonb;
  v_x text;
  v_y text;
  v_wkid text;
  v_request_id bigint;
  v_queued integer := 0;
begin
  for r in
    select s.*,h.content
    from public.integration_crm_address_enrichment_shadow s
    join net._http_response h on h.id=s.geocode_request_id
    where s.geocode_status='eligible' and h.status_code=200 and coalesce(h.error_msg,'')=''
  loop
    begin v_content := r.content::jsonb; exception when others then continue; end;
    v_x := v_content->'candidates'->0->'location'->>'x';
    v_y := v_content->'candidates'->0->'location'->>'y';
    v_wkid := coalesce(v_content->'spatialReference'->>'wkid','102711');
    if coalesce(v_x,'')='' or coalesce(v_y,'')='' then
      update public.integration_crm_address_enrichment_shadow set parcel_status='geocode_location_missing',updated_at=now() where id=r.id;
      continue;
    end if;
    select net.http_get(
      url := 'https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/arcgis/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0/query',
      params := jsonb_build_object('f','json','geometry',v_x||','||v_y,'geometryType','esriGeometryPoint','inSR',v_wkid,'spatialRel','esriSpatialRelIntersects','outFields','PAMS_PIN,PROP_LOC,ZIP5','returnGeometry','false','resultRecordCount','5'),
      headers := jsonb_build_object('accept','application/json'),
      timeout_milliseconds := 15000
    ) into v_request_id;
    update public.integration_crm_address_enrichment_shadow set parcel_request_id=v_request_id,parcel_status='spatial_queued',updated_at=now() where id=r.id;
    v_queued := v_queued + 1;
  end loop;
  return jsonb_build_object('spatial_parcel_requests_queued',v_queued);
end;
$$;
revoke all on function public.integration_crm_address_shadow_seed_spatial_parcels() from public, anon, authenticated;
grant execute on function public.integration_crm_address_shadow_seed_spatial_parcels() to service_role;

create or replace function public.integration_crm_address_shadow_summary()
returns jsonb
language plpgsql
security definer
set search_path = public, net, pg_catalog
as $$
declare
  v_gold_total integer;
  v_gold_eligible integer;
  v_gold_reproduced integer;
  v_sample_total integer;
  v_sample_eligible integer;
  v_sample_unique integer;
  v_sample_ambiguous integer;
  v_sample_none integer;
  v_pending integer;
begin
  with parcel_counts as (
    select s.id,s.cohort,s.expected_pams_pin,
           count(*) filter (where f is not null and public.integration_normalize_street_v1(f->'attributes'->>'PROP_LOC')=s.original_normalized_street and substring(coalesce(f->'attributes'->>'ZIP5','') from '([0-9]{5})')=s.recovered_zip) as exact_count,
           count(*) filter (where f is not null and public.integration_normalize_street_v1(f->'attributes'->>'PROP_LOC')=s.original_normalized_street and substring(coalesce(f->'attributes'->>'ZIP5','') from '([0-9]{5})')=s.recovered_zip and (f->'attributes'->>'PAMS_PIN')=s.expected_pams_pin) as expected_pin_count,
           true as response_present
    from public.integration_crm_address_enrichment_shadow s
    join net._http_response h on h.id=s.parcel_request_id and h.status_code=200 and coalesce(h.error_msg,'')=''
    left join lateral jsonb_array_elements(coalesce((h.content::jsonb)->'features','[]'::jsonb)) f on true
    where s.parcel_request_id is not null
    group by s.id,s.cohort,s.expected_pams_pin
  )
  select
    count(*) filter (where s.cohort='gold'),
    count(*) filter (where s.cohort='gold' and s.geocode_status='eligible'),
    count(*) filter (where s.cohort='gold' and coalesce(p.exact_count,0)=1 and coalesce(p.expected_pin_count,0)=1),
    count(*) filter (where s.cohort='missing_zip'),
    count(*) filter (where s.cohort='missing_zip' and s.geocode_status='eligible'),
    count(*) filter (where s.cohort='missing_zip' and coalesce(p.exact_count,0)=1),
    count(*) filter (where s.cohort='missing_zip' and coalesce(p.exact_count,0)>1),
    count(*) filter (where s.cohort='missing_zip' and s.geocode_status='eligible' and coalesce(p.exact_count,0)=0 and coalesce(p.response_present,false)),
    count(*) filter (where s.parcel_request_id is not null and not coalesce(p.response_present,false))
  into v_gold_total,v_gold_eligible,v_gold_reproduced,v_sample_total,v_sample_eligible,v_sample_unique,v_sample_ambiguous,v_sample_none,v_pending
  from public.integration_crm_address_enrichment_shadow s
  left join parcel_counts p on p.id=s.id;
  return jsonb_build_object(
    'mode','shadow_only_no_property_link_writes',
    'policy',jsonb_build_object('geocoder','NJOGIS NJ_Geocode','minimum_score',95,'require_nj',true,'require_exact_normalized_street',true,'require_same_recovered_zip_for_gold',true,'parcel_lookup','NJOGIS parcel point intersection','require_unique_governed_parcel',true,'auto_verify',false,'name_matching',false,'ownership_inference',false),
    'gold',jsonb_build_object('total',v_gold_total,'geocode_eligible',v_gold_eligible,'parcel_reproduced',v_gold_reproduced,'reproduction_rate',case when v_gold_total>0 then round(v_gold_reproduced::numeric*100/v_gold_total,2) else 0 end),
    'missing_zip_sample',jsonb_build_object('total',v_sample_total,'geocode_eligible',v_sample_eligible,'unique_candidates',v_sample_unique,'ambiguous',v_sample_ambiguous,'eligible_but_no_exact_parcel',v_sample_none),
    'parcel_responses_pending',v_pending
  );
end;
$$;
revoke all on function public.integration_crm_address_shadow_summary() from public, anon, authenticated;
grant execute on function public.integration_crm_address_shadow_summary() to service_role;

insert into public.integration_crm_match_policy(provider,match_method,auto_verify_enabled,minimum_human_reviews,maximum_false_positive_rate,policy_version,notes,updated_at)
values (
  'boldtrail','njogis_zip_enriched_exact_street_spatial_parcel',false,50,0.01000,1,
  'Candidate-only rule. For NJ CRM address evidence missing ZIP: NJOGIS geocoder score >=95 must recover ZIP without changing normalized street/house number, then parcel point intersection must return a parcel whose normalized PROP_LOC and ZIP match. No name matching, ownership inference, seller-intent inference, or automatic verification. Human review required.',
  now()
)
on conflict (provider,match_method) do update set
  auto_verify_enabled=excluded.auto_verify_enabled,
  minimum_human_reviews=excluded.minimum_human_reviews,
  maximum_false_positive_rate=excluded.maximum_false_positive_rate,
  policy_version=excluded.policy_version,
  notes=excluded.notes,
  updated_at=now();

-- Historical review decisions made before the resolver tagged gold outcomes are reconciled idempotently.
update public.integration_crm_property_links
set evidence = coalesce(evidence,'{}'::jsonb) || jsonb_build_object('match_tier','human_verified_gold','reviewed_match_policy',coalesce(evidence->>'match_policy','exact_normalized_street_and_zip')),
    updated_at = updated_at
where status='verified'
  and link_method='verified_address'
  and coalesce((evidence->>'user_reviewed')::boolean,false)
  and evidence->>'match_policy'='exact_normalized_street_and_zip'
  and coalesce(evidence->>'match_tier','') in ('','high_confidence_recommended');

comment on table public.integration_crm_address_enrichment_shadow is 'Service-only CRM missing-ZIP enrichment backtest. It never creates or verifies CRM-property links.';
comment on function public.integration_crm_address_shadow_seed(integer) is 'Operator-only NJOGIS missing-ZIP shadow seed. No property-link writes.';
comment on function public.integration_crm_address_shadow_process_geocode() is 'Operator-only NJOGIS response gate for CRM missing-ZIP backtest. No property-link writes.';
comment on function public.integration_crm_address_shadow_seed_spatial_parcels() is 'Operator-only parcel point-intersection stage for CRM missing-ZIP backtest. No property-link writes.';
comment on function public.integration_crm_address_shadow_summary() is 'Operator-only aggregate CRM missing-ZIP shadow summary; returns no CRM addresses or contact identifiers.';
