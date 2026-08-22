-- Promote only the already-materialized Treasury MOD-IV longitudinal source release.
-- This is a source-plane activation only. It does not mark any Data Center marker LIVE.
-- Marker promotion remains gated on authenticated runtime/canary/provider-kind/governance evidence.

do $$
declare
  v_release public.modiv_longitudinal_releases%rowtype;
  v_object_count bigint;
  v_district_object_count bigint;
  v_manifest_count bigint;
begin
  select * into v_release
  from public.modiv_longitudinal_releases
  where release_id = 'treasury-modiv-2021-2026-v2'
  for update;

  if not found then
    raise exception 'Expected MOD-IV longitudinal v2 candidate release is missing';
  end if;

  if v_release.status not in ('candidate','live') then
    raise exception 'Unexpected MOD-IV longitudinal release status: %', v_release.status;
  end if;

  if v_release.source_years <> array[2021,2022,2023,2024,2025,2026]::integer[] then
    raise exception 'Unexpected MOD-IV longitudinal source years: %', v_release.source_years;
  end if;

  if v_release.record_count <> 19153882 or v_release.district_count <> 565 then
    raise exception 'Unexpected MOD-IV longitudinal release cardinality: records %, districts %', v_release.record_count, v_release.district_count;
  end if;

  if coalesce(v_release.manifest->>'source_id','') <> 'nj-dca-modiv-longitudinal'
     or coalesce((v_release.manifest->>'schema_version')::integer,0) <> 2
     or coalesce((v_release.manifest#>>'{privacy_contract,safe_fields_only}')::boolean,false) is not true
     or coalesce((v_release.manifest#>>'{privacy_contract,raw_archives_persisted}')::boolean,true) is not false
     or coalesce((v_release.manifest#>>'{privacy_contract,owner_names_retained}')::boolean,true) is not false
     or coalesce((v_release.manifest#>>'{privacy_contract,mailing_addresses_retained}')::boolean,true) is not false
     or coalesce((v_release.manifest#>>'{privacy_contract,social_security_numbers_retained}')::boolean,true) is not false
     or coalesce((v_release.manifest#>>'{privacy_contract,mortgage_account_numbers_retained}')::boolean,true) is not false then
    raise exception 'MOD-IV longitudinal privacy/source manifest does not match the certified v2 contract';
  end if;

  if v_release.manifest#>>'{source_row_counts,2021}' <> '3177818'
     or v_release.manifest#>>'{source_row_counts,2022}' <> '3182924'
     or v_release.manifest#>>'{source_row_counts,2023}' <> '3187899'
     or v_release.manifest#>>'{source_row_counts,2024}' <> '3195997'
     or v_release.manifest#>>'{source_row_counts,2025}' <> '3201147'
     or v_release.manifest#>>'{source_row_counts,2026}' <> '3208097'
     or v_release.manifest#>>'{parcel_records_across_partitions}' <> '3321834' then
    raise exception 'MOD-IV longitudinal v2 source counts do not match the published build evidence';
  end if;

  select count(*),
         count(*) filter (where name like 'releases/treasury-modiv-2021-2026-v2/district/%.json.gz'),
         count(*) filter (where name = 'releases/treasury-modiv-2021-2026-v2/manifest.json')
  into v_object_count, v_district_object_count, v_manifest_count
  from storage.objects
  where bucket_id = 'modiv-longitudinal'
    and name like 'releases/treasury-modiv-2021-2026-v2/%';

  if v_object_count <> 566 or v_district_object_count <> 565 or v_manifest_count <> 1 then
    raise exception 'MOD-IV longitudinal v2 storage inventory mismatch: total %, districts %, manifest %', v_object_count, v_district_object_count, v_manifest_count;
  end if;

  update public.modiv_longitudinal_releases
  set status = 'live',
      activated_at = coalesce(activated_at, now()),
      updated_at = now()
  where release_id = 'treasury-modiv-2021-2026-v2';
end
$$;
