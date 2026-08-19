insert into public.data_center_provider_coverage
  (marker_id, scopes, provider_key, value_status, source_keys, last_verified_at, notes, provider_kind, source_fields, calculation_key, freshness_seconds, cache_policy, bulk_capable)
values
  (
    'njplus.nj-dca-community-assets.opportunity_zone_status',
    array['property']::text[],
    'hud-opportunity-zone-spatial',
    'live',
    array['nj-dca-community-assets','hud-qualified-opportunity-zones']::text[],
    now(),
    'Property-point intersection against the HUD Qualified Opportunity Zones FeatureServer layer 13 for the currently designated 2018-cycle zones. Potential 2026 tracts are intentionally excluded because the 2026 NJ nomination process is not final as of 2026-08-19. Boolean false is a valid source-checked result; provider failures remain provider_error. Bulk remains uncertified.',
    'authoritative_spatial_reference',
    array['lat','lon','Opportunity_Zones/FeatureServer/13']::text[],
    'spatial-preflight-v8-community-designations',
    21600,
    'refresh_on_demand',
    false
  ),
  (
    'njplus.nj-dca-community-assets.transit_village_status',
    array['property']::text[],
    'njdot-transit-village-spatial',
    'live',
    array['nj-dca-community-assets','njdot-transit-villages']::text[],
    now(),
    'Property-point intersection against NJDOT TransitVillageBuffersV6 FeatureServer layer 0, the current half-mile designated Transit Village buffer geometry. Historical DCA buffer services are not used. Boolean false is a valid source-checked result; provider failures remain provider_error. Bulk remains uncertified.',
    'authoritative_spatial_reference',
    array['lat','lon','TransitVillageBuffersV6/FeatureServer/0']::text[],
    'spatial-preflight-v8-community-designations',
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
    notes='Authoritative Community Asset Map family partially pinned. LIVE property-level designation intersections: Urban Enterprise Zone (NJDEP Government/24), Areas in Need of Redevelopment (NJDEP Government/31), currently designated Opportunity Zone (HUD Opportunity_Zones/13; potential 2026 tracts excluded), and current Transit Village half-mile buffer (NJDOT TransitVillageBuffersV6/0). Remaining six community-asset access fields stay planned until authoritative layers and exact access semantics are pinned.'
where source_id='nj-dca-community-assets';