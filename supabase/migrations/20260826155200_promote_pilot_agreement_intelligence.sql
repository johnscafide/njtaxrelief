-- Promote only row-level PILOT facts proven by the official 2026 NJ DCA workbook.
-- These are reported-source facts, not legal agreement/enforceability determinations.

insert into public.data_center_provider_coverage
(marker_id, scopes, provider_key, value_status, source_keys, last_verified_at, notes, provider_kind, source_fields, calculation_key, freshness_seconds, cache_policy, bulk_capable)
values
('njplus.nj-dca-pilot-forecast.pilot_agreement_count', array['municipality'], 'workbench-hydrate', 'live', array['nj-dca-pilot-forecast','NJ DCA PILOT Database and Viewer 2026'], now(), 'Count of distinct reported agreement fingerprints built from project name + reported start date + reported end date + reported project type. This is not a legal count of enforceable agreements. Production source contains 2,876 reported rows across 290 municipalities.', 'authoritative_reference', array['Raw Data from UFBs: Project Name','Raw Data from UFBs: Agreement Start Date','Raw Data from UFBs: Agreement End Date','Raw Data from UFBs: Type of Project'], 'nj-dca-pilot-agreement-2026-v2-db', 31536000, 'shared_property_cache', true),
('njplus.nj-dca-pilot-forecast.pilot_expiration_year', array['municipality'], 'workbench-hydrate', 'live', array['nj-dca-pilot-forecast','NJ DCA PILOT Database and Viewer 2026'], now(), 'Earliest future year among plausible reported agreement end dates after invalid/non-date and implausible-year values fail closed. Does not determine that an agreement remains active, enforceable or unamended.', 'authoritative_reference', array['Raw Data from UFBs: Agreement End Date'], 'nj-dca-pilot-agreement-2026-v2-db', 31536000, 'shared_property_cache', true),
('njplus.nj-dca-pilot-forecast.pilot_term_remaining', array['municipality'], 'workbench-hydrate', 'live', array['nj-dca-pilot-forecast','NJ DCA PILOT Database and Viewer 2026'], now(), 'Approximate months from request time to the earliest future plausible reported agreement end date. This is a reported-source timing context and not a legal term determination.', 'authoritative_reference', array['Raw Data from UFBs: Agreement End Date'], 'nj-dca-pilot-agreement-2026-v2-db', 86400, 'refresh_on_demand', true),
('njplus.nj-dca-pilot-forecast.pilot_project_type', array['municipality'], 'workbench-hydrate', 'live', array['nj-dca-pilot-forecast','NJ DCA PILOT Database and Viewer 2026'], now(), 'Deterministic project-type mix across raw reported municipal PILOT rows. Counts describe reported rows and need not equal the distinct agreement-fingerprint count; no arbitrary single project type is selected.', 'authoritative_reference', array['Raw Data from UFBs: Type of Project'], 'nj-dca-pilot-agreement-2026-v2-db', 31536000, 'shared_property_cache', true)
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
