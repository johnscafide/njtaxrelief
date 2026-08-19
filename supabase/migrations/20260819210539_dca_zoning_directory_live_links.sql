insert into public.data_center_provider_coverage
  (marker_id, scopes, provider_key, value_status, source_keys, last_verified_at, notes, provider_kind, source_fields, calculation_key, freshness_seconds, cache_policy, bulk_capable)
values
  (
    'njplus.nj-dca-zoning-directory.zoning_map_url',
    array['municipality']::text[],
    'dca_zoning_directory_v1',
    'live',
    array['nj-dca-zoning-directory','dca-municipal-zoning-20260323']::text[],
    now(),
    'Official NJ DCA Municipal Zoning directory Map link. The 2026-03-23 DCA layer has a nonblank Map value for all 564 municipal polygons. This is a research entrypoint, not a zoning classification or currentness determination; verify with the municipality before reliance.',
    'authoritative_reference',
    array['Map']::text[],
    null,
    21600,
    'external_live',
    false
  ),
  (
    'njplus.nj-dca-zoning-directory.zoning_ordinance_url',
    array['municipality']::text[],
    'dca_zoning_directory_v1',
    'live',
    array['nj-dca-zoning-directory','dca-municipal-zoning-20260323']::text[],
    now(),
    'Official NJ DCA Municipal Zoning directory Ordinance link. The 2026-03-23 DCA layer has a nonblank Ordinance value for all 564 municipal polygons. This is a research entrypoint, not a zoning interpretation or currentness determination; verify with the municipality before reliance.',
    'authoritative_reference',
    array['Ordinance']::text[],
    null,
    21600,
    'external_live',
    false
  ),
  (
    'njplus.nj-dca-zoning-directory.municipal_zoning_portal',
    array['municipality']::text[],
    'dca_zoning_directory_v1',
    'live',
    array['nj-dca-zoning-directory','dca-municipal-zoning-20260323']::text[],
    now(),
    'Official NJ DCA Municipal Zoning directory Website link. The 2026-03-23 DCA layer has a nonblank Website value for all 564 municipal polygons. This is a research entrypoint; DCA does not attest that every linked municipal page remains current, so verify locally before reliance.',
    'authoritative_reference',
    array['Website']::text[],
    null,
    21600,
    'external_live',
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
    notes='NJ DCA Municipal Zoning Feature Service (source known as of 2026-03-23) is partially live. Certified raw fields: zoning map URL <- Map, zoning ordinance URL <- Ordinance, municipal zoning portal <- Website. All three are populated across 564/564 municipal polygons and passed a signed-in Workbench v31 canary. Seven additional catalog fields remain planned because this source does not publish their exact semantics. DCA links are research entrypoints and require municipal currentness verification.'
where source_id='nj-dca-zoning-directory';
