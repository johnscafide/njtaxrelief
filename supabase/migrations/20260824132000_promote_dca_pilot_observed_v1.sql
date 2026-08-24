-- NJW-143: promote only the observed NJ DCA PILOT fields proven by the
-- authenticated production canary. The separate PFAF workbook is a scenario
-- model for proposed agreements; its simulated schedules/revenue are not
-- municipality observations and remain unavailable.

update public.dca_source_registry
set source_status = 'partial',
    source_url = 'https://nj.gov/dca/dlgs/taxabatementkit.shtml',
    source_vintage = 'PILOT Database and Viewer 2026 using 2025 UFB submissions; PFAF Model 2026 kept separate as proposed-agreement simulation',
    geography_scope = 'municipality',
    join_strategy = 'parcel Treasury municipality code -> DCA Summary By Town',
    refresh_cadence = 'annual',
    authoritative = true,
    last_checked_at = now(),
    notes = 'The authoritative observed source is the NJ DCA PILOT Database and Viewer 2026. Authenticated production canary 2590 proved the DCA-reported municipal PILOT record count and aggregate PILOT assessed value for Atlantic City. The PFAF workbook is an interactive model for proposed agreements requiring user assumptions; payment schedule, term/expiration aggregation, revenue projection, forecast year and municipal-share simulation are not promoted as observed municipality facts. Agreement count and project type also remain unavailable because the current marker semantics do not define a legally reliable distinct-agreement/project aggregation.'
where source_id = 'nj-dca-pilot-forecast';

insert into public.data_center_provider_coverage
(marker_id, scopes, provider_key, value_status, source_keys, last_verified_at, notes, provider_kind, source_fields, calculation_key, freshness_seconds, cache_policy, bulk_capable)
values
('njplus.nj-dca-pilot-forecast.pilot_project_count', array['municipality'], 'workbench-hydrate', 'live', array['nj-dca-pilot-forecast','NJ DCA PILOT Database and Viewer 2026'], now(), 'Authenticated production canary 2590 returned 26 for Atlantic City. Value is the DCA Summary By Town Total Number / reported PILOT record count and is explicitly not represented as a legal count of distinct agreements or distinct development projects.', 'authoritative_reference', array['Summary By Town: Total Number'], null, 31536000, 'shared_property_cache', true),
('njplus.nj-dca-pilot-forecast.pilot_project_assessment', array['municipality'], 'workbench-hydrate', 'live', array['nj-dca-pilot-forecast','NJ DCA PILOT Database and Viewer 2026'], now(), 'Authenticated production canary 2590 returned 277093300 for Atlantic City. Value is the exact aggregate PILOT assessed value published in the DCA municipal summary.', 'authoritative_reference', array['Summary By Town: Total PILOT Assessed Value'], null, 31536000, 'shared_property_cache', true),
('njplus.nj-dca-pilot-forecast.pilot_agreement_count', array['municipality'], 'workbench-hydrate', 'unavailable', array['NJ DCA PILOT Database and Viewer 2026'], now(), 'DCA publishes reported PILOT rows/counts, but the marker contract does not define a legally reliable distinct-agreement count when project names/rows repeat. Do not substitute the reported row count.', 'authoritative_reference', array['Raw Data from UFBs: Project Name','Agreement Start Date','Agreement End Date'], null, 31536000, 'shared_property_cache', false),
('njplus.nj-dca-pilot-forecast.pilot_payment_schedule', array['municipality'], 'workbench-hydrate', 'unavailable', array['NJ DCA PFAF Model 2026'], now(), 'The PFAF payment schedule is scenario output generated from user-entered proposed-agreement assumptions, not an observed municipality fact. No canonical observed payment-schedule field is promoted.', 'authoritative_reference', array[]::text[], null, 31536000, 'shared_property_cache', false),
('njplus.nj-dca-pilot-forecast.pilot_term_remaining', array['municipality'], 'workbench-hydrate', 'unavailable', array['NJ DCA PILOT Database and Viewer 2026'], now(), 'Raw agreement end dates exist for some reported PILOT rows, but municipalities can contain multiple agreements and missing dates. The singular marker has no governed aggregation contract, so no term-remaining value is synthesized.', 'authoritative_reference', array['Raw Data from UFBs: Agreement End Date'], null, 31536000, 'shared_property_cache', false),
('njplus.nj-dca-pilot-forecast.pilot_expiration_year', array['municipality'], 'workbench-hydrate', 'unavailable', array['NJ DCA PILOT Database and Viewer 2026'], now(), 'Raw agreement end dates exist for some reported PILOT rows, but the singular municipal marker has no governed rule for choosing among multiple agreements and missing dates. No expiration year is synthesized.', 'authoritative_reference', array['Raw Data from UFBs: Agreement End Date'], null, 31536000, 'shared_property_cache', false),
('njplus.nj-dca-pilot-forecast.pilot_revenue_projection', array['municipality'], 'workbench-hydrate', 'unavailable', array['NJ DCA PFAF Model 2026'], now(), 'Authenticated production canary 2590 negative control remained provider_missing. PFAF revenue projection is modeled from proposed-agreement assumptions and is not promoted as an observed municipality fact.', 'authoritative_reference', array[]::text[], null, 31536000, 'shared_property_cache', false),
('njplus.nj-dca-pilot-forecast.pilot_forecast_year', array['municipality'], 'workbench-hydrate', 'unavailable', array['NJ DCA PFAF Model 2026'], now(), 'PFAF model vintage/year is not a municipality observation and does not satisfy the current marker semantics as a municipal forecast fact.', 'authoritative_reference', array[]::text[], null, 31536000, 'shared_property_cache', false),
('njplus.nj-dca-pilot-forecast.pilot_project_type', array['municipality'], 'workbench-hydrate', 'unavailable', array['NJ DCA PILOT Database and Viewer 2026'], now(), 'DCA publishes project type per reported PILOT row. A municipality can have multiple types; the singular marker lacks a governed structured/type-mix contract, so no arbitrary type or synthetic aggregation is promoted.', 'authoritative_reference', array['Raw Data from UFBs: Type of Project'], null, 31536000, 'shared_property_cache', false),
('njplus.nj-dca-pilot-forecast.pilot_municipal_share', array['municipality'], 'workbench-hydrate', 'unavailable', array['NJ DCA PILOT Database and Viewer 2026','NJ DCA PFAF Model 2026'], now(), 'The observed database Municipal Share of Levy is the ordinary municipal levy share and is not substituted for PILOT agreement allocation. PFAF municipal share is scenario input/output for a proposed agreement. No observed equivalent is promoted.', 'authoritative_reference', array[]::text[], null, 31536000, 'shared_property_cache', false)
on conflict (marker_id) do update
set scopes = excluded.scopes,
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
