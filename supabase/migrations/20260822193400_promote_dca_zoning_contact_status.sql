-- Promote only the two exact NJ DCA Zoning Information Directory workbook semantics
-- proven by authenticated production canary 1951. Do not infer plan/board/currentness fields.
-- Production application succeeded as promote_dca_zoning_contact_status_v2 after the governed
-- versioned_observation cache policy passed the provider-registry constraint.
insert into public.data_center_provider_coverage
  (marker_id, scopes, provider_key, value_status, source_keys, last_verified_at, notes, provider_kind, source_fields, calculation_key, freshness_seconds, cache_policy, bulk_capable)
values
  (
    'njplus.nj-dca-zoning-directory.zoning_officer_contact',
    array['municipality']::text[],
    'dca_zoning_directory_v2',
    'live',
    array['nj-dca-zoning-directory','dca-zoning-directory-workbook-20260317']::text[],
    now(),
    'Official NJ DCA Zoning Information Directory workbook contact record. Pinned workbook SHA-256 165b1e0d7b6c14583a88c1f675d91a0e2babd1b4edaa74fa5667906c789da4f9 contains 564/564 current Treasury municipality codes; all 564 publish a zoning-office phone and 511 also publish an email/contact page. Authenticated production canary 1951 returned the exact Atlantic City contact. DCA does not attest ongoing municipal-link/contact currentness; verify locally before reliance.',
    'authoritative_reference',
    array['Zoning Office Phone','Zoning Office Email/Contact Page']::text[],
    null,
    21600,
    'versioned_observation',
    false
  ),
  (
    'njplus.nj-dca-zoning-directory.zoning_directory_status',
    array['municipality']::text[],
    'dca_zoning_directory_v2',
    'live',
    array['nj-dca-zoning-directory','dca-zoning-directory-workbook-20260317']::text[],
    now(),
    'Directory-listing status is the exact presence of the municipality in the pinned NJ DCA Zoning Information Directory workbook, not a zoning approval/currentness finding. The pinned workbook contains 564/564 current Treasury municipality codes. Authenticated production canary 1951 returned listed for Atlantic City.',
    'authoritative_reference',
    array['Treasury Municipality Code']::text[],
    null,
    21600,
    'versioned_observation',
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
    source_vintage='2026-03-17 workbook + 2026-03-23 feature service',
    join_strategy='Treasury municipality code -> pinned DCA workbook contact/listing; parcel centroid -> DCA municipal zoning feature service links',
    last_checked_at=now(),
    notes='NJ DCA zoning directory family is partially live with five exact raw fields. Feature service: zoning map URL <- Map, zoning ordinance URL <- Ordinance, municipal zoning portal <- Website. Pinned 2026-03-17 workbook: zoning officer contact <- published phone plus optional email/contact page; zoning directory status <- exact municipality row presence. Workbook SHA-256 165b1e0d7b6c14583a88c1f675d91a0e2babd1b4edaa74fa5667906c789da4f9 covers 564/564 current Treasury municipality codes and passed authenticated canary 1951. Five catalog fields remain planned: zoning_map_last_checked, redevelopment_plan_link, master_plan_link, planning_board_link, land_use_board_link. DCA does not publish exact semantics/currentness for those fields, so Watchdog does not infer them.'
where source_id='nj-dca-zoning-directory';
