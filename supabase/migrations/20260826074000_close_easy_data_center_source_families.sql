-- Close three Data Center source families where the remaining work is governance,
-- not missing executable provider coverage. Preserve fail-closed semantics for
-- concepts the authoritative statewide source does not actually publish.

-- Municipal Housing Profile: all eight catalog markers already have governed live
-- providers backed by exact NJ DCA 2026 Neighborhood Trends municipality fields.
update public.dca_source_registry
set source_status = 'live',
    join_strategy = 'Treasury municipality code -> governed NJ DCA 2026 Neighborhood Trends municipality row; no Power BI scraping required',
    last_checked_at = now(),
    notes = 'Closed 2026-08-26: all 8 cataloged Municipal Housing Profile markers have governed live production providers. Values are sourced from exact official NJ DCA 2026 Neighborhood Trends municipality fields (or transparent calculations over those fields), using the logical Municipal Housing Profile source_id for catalog reconciliation. This does not claim or scrape unsupported Power BI-only fields.'
where source_id = 'nj-dca-municipal-housing-profile';

-- New Home Warranty: nine catalog fields are operational from the latest accessible
-- official quarterly tables. The municipality-rank concept remains unavailable
-- because DCA publishes this family at county level.
update public.dca_source_registry
set source_status = 'live',
    last_checked_at = now(),
    notes = 'Closed 2026-08-26 as an operational provider family: 9 of 10 cataloged New Home Warranty markers are governed live from the latest accessible official DCA quarterly tables (Q4 2025 preliminary, with Q3 2025 retained for quarter-over-quarter calculations). The remaining municipal-rank marker is intentionally unavailable because the official source is county-level; Watchdog does not synthesize a municipality rank. The 2026 Q1 page exists but its PDF/XLS links remain 404, so marker vintage is exposed explicitly and refresh must advance only when an official accessible table is available.'
where source_id = 'nj-dca-new-home-warranty';

-- Zoning Directory: retire five aspirational catalog concepts from the planned
-- backlog by recording them as unavailable. DCA does not publish statewide canonical
-- semantics/currentness for these concepts, so arbitrary municipal scraping is not a
-- valid substitute.
insert into public.data_center_provider_coverage
  (marker_id, scopes, provider_key, value_status, source_keys, last_verified_at,
   notes, provider_kind, source_fields, calculation_key, freshness_seconds,
   cache_policy, bulk_capable)
values
  ('njplus.nj-dca-zoning-directory.zoning_map_last_checked',
   array['municipality']::text[], 'dca_zoning_directory_v2', 'unavailable',
   array['nj-dca-zoning-directory','dca-municipal-zoning-20260323']::text[], now(),
   'DCA publishes zoning map links but does not publish a per-municipality last-checked timestamp for those links. Watchdog does not synthesize currentness metadata.',
   'authoritative_reference', array[]::text[], null, 21600, 'versioned_observation', false),
  ('njplus.nj-dca-zoning-directory.redevelopment_plan_link',
   array['municipality']::text[], 'dca_zoning_directory_v2', 'unavailable',
   array['nj-dca-zoning-directory']::text[], now(),
   'The governed NJ DCA Zoning Information Directory does not publish a canonical redevelopment-plan link with defined statewide semantics. Watchdog does not infer one from arbitrary municipal pages.',
   'authoritative_reference', array[]::text[], null, 21600, 'versioned_observation', false),
  ('njplus.nj-dca-zoning-directory.master_plan_link',
   array['municipality']::text[], 'dca_zoning_directory_v2', 'unavailable',
   array['nj-dca-zoning-directory']::text[], now(),
   'The governed NJ DCA Zoning Information Directory does not publish a canonical municipal master-plan link with defined statewide semantics. Watchdog does not infer one from arbitrary municipal pages.',
   'authoritative_reference', array[]::text[], null, 21600, 'versioned_observation', false),
  ('njplus.nj-dca-zoning-directory.planning_board_link',
   array['municipality']::text[], 'dca_zoning_directory_v2', 'unavailable',
   array['nj-dca-zoning-directory']::text[], now(),
   'The governed NJ DCA Zoning Information Directory does not publish a canonical planning-board link for every municipality. Watchdog does not synthesize or scrape an ungoverned replacement.',
   'authoritative_reference', array[]::text[], null, 21600, 'versioned_observation', false),
  ('njplus.nj-dca-zoning-directory.land_use_board_link',
   array['municipality']::text[], 'dca_zoning_directory_v2', 'unavailable',
   array['nj-dca-zoning-directory']::text[], now(),
   'The governed NJ DCA Zoning Information Directory does not publish a canonical land-use-board link for every municipality. Watchdog does not synthesize or scrape an ungoverned replacement.',
   'authoritative_reference', array[]::text[], null, 21600, 'versioned_observation', false)
on conflict (marker_id) do update set
  scopes = excluded.scopes,
  provider_key = excluded.provider_key,
  value_status = excluded.value_status,
  source_keys = excluded.source_keys,
  last_verified_at = excluded.last_verified_at,
  notes = excluded.notes,
  provider_kind = excluded.provider_kind,
  source_fields = excluded.source_fields,
  calculation_key = excluded.calculation_key,
  freshness_seconds = excluded.freshness_seconds,
  cache_policy = excluded.cache_policy,
  bulk_capable = excluded.bulk_capable;

update public.dca_source_registry
set source_status = 'live',
    last_checked_at = now(),
    notes = 'Closed 2026-08-26 as a governed provider family. Five exact DCA zoning fields are live: map URL, ordinance URL, municipal zoning portal, zoning officer contact, and directory status. Five catalog concepts are intentionally unavailable because DCA does not publish statewide canonical semantics/currentness for them: zoning_map_last_checked, redevelopment_plan_link, master_plan_link, planning_board_link, land_use_board_link. Watchdog does not infer or scrape substitutes.'
where source_id = 'nj-dca-zoning-directory';
