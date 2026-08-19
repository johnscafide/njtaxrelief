insert into public.data_center_provider_coverage
  (marker_id, scopes, provider_key, value_status, source_keys, last_verified_at, notes, provider_kind, source_fields, calculation_key, freshness_seconds, cache_policy, bulk_capable)
values
  (
    'njplus.nj-dca-community-assets.urban_enterprise_zone_status',
    array['property']::text[],
    'njdep-government-spatial',
    'live',
    array['nj-dca-community-assets','njdep-government-uez']::text[],
    now(),
    'Property-point intersection against NJDEP Government MapServer layer 24 (Urban Enterprise Zones). Boolean false is a valid source-checked result; provider failures remain provider_error. Bulk remains uncertified.',
    'authoritative_spatial_reference',
    array['lat','lon','Government/MapServer/24']::text[],
    'spatial-preflight-v7-community-designations',
    21600,
    'refresh_on_demand',
    false
  ),
  (
    'njplus.nj-dca-community-assets.redevelopment_area_status',
    array['property']::text[],
    'njdep-government-spatial',
    'live',
    array['nj-dca-community-assets','njdep-government-redevelopment']::text[],
    now(),
    'Property-point intersection against NJDEP Government MapServer layer 31 (Areas in Need of Redevelopment). Boolean false is a valid source-checked result; provider failures remain provider_error. Bulk remains uncertified.',
    'authoritative_spatial_reference',
    array['lat','lon','Government/MapServer/31']::text[],
    'spatial-preflight-v7-community-designations',
    21600,
    'refresh_on_demand',
    false
  )
on conflict (marker_id) do update set
  scopes=excluded.scopes,
  provider_key=excluded.provider_key,
  value_status=excluded.value_status,
  source_keys=excluded.source_keys,
  last_verified_at=excluded.last_verified_at,
  notes=excluded.notes,
  provider_kind=excluded.provider_kind,
  source_fields=excluded.source_fields,
  calculation_key=excluded.calculation_key,
  freshness_seconds=excluded.freshness_seconds,
  cache_policy=excluded.cache_policy,
  bulk_capable=excluded.bulk_capable;

update public.dca_source_registry
set source_status='partial',
    last_checked_at=now(),
    notes='Authoritative Community Asset Map family partially pinned. LIVE property-level intersections: Urban Enterprise Zones via NJDEP Government MapServer/24 and Areas in Need of Redevelopment via MapServer/31. Remaining community-asset fields stay planned until their authoritative layers and exact access/designation semantics are pinned.'
where source_id='nj-dca-community-assets';