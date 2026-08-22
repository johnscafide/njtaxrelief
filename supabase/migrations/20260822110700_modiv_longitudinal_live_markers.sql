do $block$
declare
  v_release record;
  v_customer_canary boolean;
  v_missing_year_canary boolean;
  v_target_ids text[] := array[
    'njplus.nj-dca-modiv-longitudinal.assessment_history_depth',
    'njplus.nj-dca-modiv-longitudinal.assessment_land_history',
    'njplus.nj-dca-modiv-longitudinal.assessment_improvement_history',
    'njplus.nj-dca-modiv-longitudinal.assessment_total_history',
    'njplus.nj-dca-modiv-longitudinal.property_class_history',
    'njplus.nj-dca-modiv-longitudinal.exemption_code_history',
    'njplus.nj-dca-modiv-longitudinal.assessment_record_years'
  ];
begin
  select release_id,status,record_count,district_count,source_years,manifest
    into v_release
  from public.modiv_longitudinal_releases
  where release_id='treasury-modiv-2021-2026-v2';

  if v_release.release_id is null
     or v_release.status <> 'live'
     or v_release.record_count <> 19153882
     or v_release.district_count <> 565
     or v_release.source_years <> array[2021,2022,2023,2024,2025,2026]
     or v_release.manifest->>'source_id' <> 'nj-dca-modiv-longitudinal'
     or (v_release.manifest->>'schema_version')::int <> 2
     or v_release.manifest#>>'{privacy_contract,safe_fields_only}' <> 'true'
     or v_release.manifest#>>'{privacy_contract,raw_archives_persisted}' <> 'false'
     or v_release.manifest#>>'{privacy_contract,owner_names_retained}' <> 'false'
     or v_release.manifest#>>'{privacy_contract,mailing_addresses_retained}' <> 'false'
     or v_release.manifest#>>'{privacy_contract,social_security_numbers_retained}' <> 'false'
     or v_release.manifest#>>'{privacy_contract,mortgage_account_numbers_retained}' <> 'false'
  then
    raise exception 'MOD-IV longitudinal v2 release contract is not certified live';
  end if;

  select exists(
    select 1
    from public.watchdog_test_auth_events
    where event_type='provider_release_canary'
      and created_at > now()-interval '60 minutes'
      and metadata->>'scenario'='modiv_longitudinal_v1'
      and metadata->>'status_code'='200'
      and metadata->>'assertion_ok'='true'
  ) into v_customer_canary;

  select exists(
    select 1
    from public.watchdog_test_auth_events
    where event_type='provider_release_canary'
      and created_at > now()-interval '60 minutes'
      and metadata->>'scenario'='modiv_longitudinal_missing_year_v1'
      and metadata->>'status_code'='200'
      and metadata->>'ok'='true'
      and metadata#>>'{assertion,synthesized_missing_years}'='false'
  ) into v_missing_year_canary;

  if not v_customer_canary then
    raise exception 'Fresh authenticated MOD-IV longitudinal customer-path canary is required';
  end if;
  if not v_missing_year_canary then
    raise exception 'Fresh MOD-IV longitudinal missing-year semantics canary is required';
  end if;

  insert into public.data_center_provider_coverage
    (marker_id,scopes,provider_key,value_status,source_keys,last_verified_at,notes,provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable)
  values
    ('njplus.nj-dca-modiv-longitudinal.assessment_history_depth',array['property'],'workbench-hydrate','live',array['nj-dca-modiv-longitudinal','treasury-modiv-2021-2026-v2'],now(),'Count of authoritative annual Treasury MOD-IV tax-list records for the exact district/block/lot/qualifier identity. Authenticated customer-path canary request 1819 returned six real years; missing-year release canary request 1818 proved absent years remain absent and are not synthesized.','authoritative_reference',array['records.years'],null,21600,'refresh_on_demand',false),
    ('njplus.nj-dca-modiv-longitudinal.assessment_land_history',array['property'],'workbench-hydrate','live',array['nj-dca-modiv-longitudinal','treasury-modiv-2021-2026-v2'],now(),'Year-keyed LAND-VALUE history from the certified privacy-minimized Treasury MOD-IV longitudinal release. Exact parcel identity only; no old-property-ID bridging or missing-year synthesis.','authoritative_reference',array['records.land'],null,21600,'refresh_on_demand',false),
    ('njplus.nj-dca-modiv-longitudinal.assessment_improvement_history',array['property'],'workbench-hydrate','live',array['nj-dca-modiv-longitudinal','treasury-modiv-2021-2026-v2'],now(),'Year-keyed IMPROVEMENT-VALUE history from the certified privacy-minimized Treasury MOD-IV longitudinal release. Exact parcel identity only; no missing-year synthesis.','authoritative_reference',array['records.improvement'],null,21600,'refresh_on_demand',false),
    ('njplus.nj-dca-modiv-longitudinal.assessment_total_history',array['property'],'workbench-hydrate','live',array['nj-dca-modiv-longitudinal','treasury-modiv-2021-2026-v2'],now(),'Year-keyed NET-VALUE history from the certified privacy-minimized Treasury MOD-IV longitudinal release. Exact parcel identity only; no missing-year synthesis.','authoritative_reference',array['records.total'],null,21600,'refresh_on_demand',false),
    ('njplus.nj-dca-modiv-longitudinal.property_class_history',array['property'],'workbench-hydrate','live',array['nj-dca-modiv-longitudinal','treasury-modiv-2021-2026-v2'],now(),'Year-keyed PROPERTY-CLASS history from authoritative annual Treasury MOD-IV tax lists. Missing parcel-years remain absent.','authoritative_reference',array['records.class'],null,21600,'refresh_on_demand',false),
    ('njplus.nj-dca-modiv-longitudinal.exemption_code_history',array['property'],'workbench-hydrate','live',array['nj-dca-modiv-longitudinal','treasury-modiv-2021-2026-v2'],now(),'Year-keyed nonblank published EXEMPTION-CODE slots from authoritative annual Treasury MOD-IV tax lists. Empty published code lists remain valid empty arrays; missing parcel-years remain absent.','authoritative_reference',array['records.exemptions'],null,21600,'refresh_on_demand',false),
    ('njplus.nj-dca-modiv-longitudinal.assessment_record_years',array['property'],'workbench-hydrate','live',array['nj-dca-modiv-longitudinal','treasury-modiv-2021-2026-v2'],now(),'Ascending authoritative annual Treasury MOD-IV archive years in which the exact parcel identity occurs. Missing-year canary request 1818 found a real three-year record (2024-2026) and proved 2021-2023 remain absent.','authoritative_reference',array['records.years'],null,21600,'refresh_on_demand',false)
  on conflict (marker_id) do nothing;

  if exists(
    select 1
    from public.data_center_provider_coverage
    where marker_id=any(v_target_ids)
      and (value_status<>'live' or provider_key<>'workbench-hydrate' or provider_kind<>'authoritative_reference' or scopes<>array['property']::text[])
  ) then
    raise exception 'Concurrent MOD-IV longitudinal coverage row conflicts with certified contract';
  end if;

  if (select count(*) from public.data_center_provider_coverage where marker_id=any(v_target_ids)) <> 7 then
    raise exception 'Expected exactly seven certified MOD-IV longitudinal coverage rows';
  end if;
end;
$block$;
