-- Close the next Data Center source-family tier using production-proven provider
-- coverage. Unsupported catalog concepts are recorded as unavailable rather than
-- synthesized from unlike fields.

-- Community Assets: all ten catalog markers already have governed live providers.
update public.dca_source_registry
set source_status='live',
    join_strategy='canonical parcel centroid -> pinned authoritative state/federal spatial layers with marker-specific intersection/proximity semantics',
    last_checked_at=now(),
    notes='Closed 2026-08-26: all 10 cataloged Community Assets markers have governed live production providers. Four designation/intersection markers use current authoritative NJDEP/HUD/NJDOT layers; six access markers use explicit 1 statute mile straight-line proximity screens against current DCA Community Asset Map layers. False is a valid source-checked result; missing coordinates/provider failures remain missing/error. Bulk remains uncertified.'
where source_id='nj-dca-community-assets';

-- Affordable Housing: the governed 2026-07-01 workbook/parser exposes seven
-- matching catalog semantics. Keep the three non-matching concepts fail-closed.
insert into public.data_center_provider_coverage
(marker_id,scopes,provider_key,value_status,source_keys,last_verified_at,notes,provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable)
values
('njplus.nj-dca-affordable-housing.affordable_units_pipeline',array['municipality']::text[],'dca_housing_context_v1','unavailable',array['nj-dca-affordable-housing','dca-affordable-housing-municipal-v3-project-trust-merge']::text[],now(),'The governed 2026-07-01 NJ DCA Municipal Affordable Housing Status workbook parser does not match a pipeline/under-construction/future-unit field in the selected project table. Watchdog does not infer pipeline units from project status or other unlike fields.','authoritative_reference',array[]::text[],null,31536000,'versioned_observation',false),
('njplus.nj-dca-affordable-housing.hud_subsidized_units',array['municipality']::text[],'dca_housing_context_v1','unavailable',array['nj-dca-affordable-housing','dca-affordable-housing-municipal-v3-project-trust-merge']::text[],now(),'The governed 2026-07-01 NJ DCA Municipal Affordable Housing Status workbook parser does not expose a canonical HUD-subsidized-unit field in the selected project/trust tables. Watchdog does not merge a separate HUD dataset into this DCA marker without a new governed source contract.','authoritative_reference',array[]::text[],null,31536000,'versioned_observation',false),
('njplus.nj-dca-affordable-housing.low_income_cost_burden',array['municipality']::text[],'dca_housing_context_v1','unavailable',array['nj-dca-affordable-housing','dca-affordable-housing-municipal-v3-project-trust-merge']::text[],now(),'The governed 2026-07-01 NJ DCA Municipal Affordable Housing Status workbook parser does not match a low-income cost-burden field. Broader ACS/DCA housing-cost burden is not substituted because it has different semantics.','authoritative_reference',array[]::text[],null,31536000,'versioned_observation',false)
on conflict(marker_id) do update set
  scopes=excluded.scopes, provider_key=excluded.provider_key, value_status=excluded.value_status,
  source_keys=excluded.source_keys, last_verified_at=excluded.last_verified_at, notes=excluded.notes,
  provider_kind=excluded.provider_kind, source_fields=excluded.source_fields,
  freshness_seconds=excluded.freshness_seconds, cache_policy=excluded.cache_policy,
  bulk_capable=excluded.bulk_capable;

update public.dca_source_registry
set source_status='live',
    source_vintage='2026-07-01 municipal status workbook; governed v3 project/trust merge',
    join_strategy='DCA/Taxation municipality code -> governed municipal project aggregation + trust-fund merge',
    last_checked_at=now(),
    notes='Closed 2026-08-26 as an operational family. The governed 2026-07-01 workbook parser passes across 564 municipalities and provides 7 exact/governed catalog fields. Three catalog concepts are intentionally unavailable because the selected official tables do not publish matching semantics: affordable_units_pipeline, hud_subsidized_units, low_income_cost_burden. No unlike field or outside dataset is silently substituted.'
where source_id='nj-dca-affordable-housing';

-- Neighborhood Trends: seven exact/deterministic municipality outputs are live.
-- The builder explicitly refuses the three unlike/unsupported substitutions.
insert into public.data_center_provider_coverage
(marker_id,scopes,provider_key,value_status,source_keys,last_verified_at,notes,provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable)
values
('njplus.nj-dca-neighborhood-trends.real_estate_tax_median',array['municipality']::text[],'dca_housing_context_v1','unavailable',array['nj-dca-neighborhood-trends','NJ DCA 2026 Neighborhood Trends Database']::text[],now(),'The governed Neighborhood Trends builder intentionally does not synthesize the catalog median real-estate-tax marker because no exact municipality-level source contract is pinned for that semantic in the current builder.','authoritative_reference',array[]::text[],null,31536000,'versioned_observation',false),
('njplus.nj-dca-neighborhood-trends.walkability_score',array['municipality']::text[],'dca_housing_context_v1','unavailable',array['nj-dca-neighborhood-trends','NJ DCA 2026 Neighborhood Trends Database']::text[],now(),'The governed Neighborhood Trends builder explicitly excludes walkability_score rather than manufacturing it from unlike mobility or density fields. No exact published municipality-level walkability source contract is currently pinned.','authoritative_reference',array[]::text[],null,31536000,'versioned_observation',false),
('njplus.nj-dca-neighborhood-trends.commute_mode_mix',array['municipality']::text[],'dca_housing_context_v1','unavailable',array['nj-dca-neighborhood-trends','NJ DCA 2026 Neighborhood Trends Database']::text[],now(),'The governed Neighborhood Trends builder explicitly excludes commute_mode_mix rather than synthesizing a structure from unlike fields. No exact governed output contract for commute-mode mix is currently pinned.','authoritative_reference',array[]::text[],null,31536000,'versioned_observation',false)
on conflict(marker_id) do update set
  scopes=excluded.scopes, provider_key=excluded.provider_key, value_status=excluded.value_status,
  source_keys=excluded.source_keys, last_verified_at=excluded.last_verified_at, notes=excluded.notes,
  provider_kind=excluded.provider_kind, source_fields=excluded.source_fields,
  freshness_seconds=excluded.freshness_seconds, cache_policy=excluded.cache_policy,
  bulk_capable=excluded.bulk_capable;

update public.dca_source_registry
set source_status='live', geography_scope='municipality',
    join_strategy='official DCA Data by Municipality row -> governed Treasury municipality crosswalk',
    last_checked_at=now(),
    notes='Closed 2026-08-26 as an operational family. Seven exact/deterministic municipality markers are governed live from the official 2026 Neighborhood Trends workbook. Three catalog concepts are intentionally unavailable because the source builder explicitly refuses unlike substitutions: real_estate_tax_median, walkability_score, commute_mode_mix.'
where source_id='nj-dca-neighborhood-trends';

-- Correct the earlier Municipal Housing Profile count: v0.31 defines ten fields.
insert into public.data_center_provider_coverage
(marker_id,scopes,provider_key,value_status,source_keys,last_verified_at,notes,provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable)
values
('njplus.nj-dca-municipal-housing-profile.eviction_rate',array['municipality']::text[],'dca_housing_context_v1','unavailable',array['nj-dca-municipal-housing-profile','NJ DCA 2026 Neighborhood Trends Database']::text[],now(),'The governed Municipal Housing Profile compatibility contract does not expose an exact municipality eviction-rate field. Watchdog does not infer eviction rate from unrelated housing or vacancy fields.','authoritative_reference',array[]::text[],null,31536000,'versioned_observation',false),
('njplus.nj-dca-municipal-housing-profile.housing_production',array['municipality']::text[],'dca_housing_context_v1','unavailable',array['nj-dca-municipal-housing-profile','NJ DCA 2026 Neighborhood Trends Database']::text[],now(),'The governed Municipal Housing Profile compatibility contract does not expose an exact housing-production field. Housing-unit change is a different Neighborhood Trends marker and is not substituted.','authoritative_reference',array[]::text[],null,31536000,'versioned_observation',false)
on conflict(marker_id) do update set
  scopes=excluded.scopes, provider_key=excluded.provider_key, value_status=excluded.value_status,
  source_keys=excluded.source_keys, last_verified_at=excluded.last_verified_at, notes=excluded.notes,
  provider_kind=excluded.provider_kind, source_fields=excluded.source_fields,
  freshness_seconds=excluded.freshness_seconds, cache_policy=excluded.cache_policy,
  bulk_capable=excluded.bulk_capable;

update public.dca_source_registry
set source_status='live', last_checked_at=now(),
    notes='Corrected closure 2026-08-26: the v0.31 catalog defines 10 Municipal Housing Profile markers, not 8. Eight exact/deterministic compatibility fields are governed live from official DCA 2026 Neighborhood Trends municipality data. eviction_rate and housing_production are intentionally unavailable because the current governed source contract does not publish matching semantics; no substitutes are invented.'
where source_id='nj-dca-municipal-housing-profile';

-- PILOT: two observed municipal facts are live; eight other catalog concepts are
-- already explicitly unavailable because they are ambiguous aggregations or PFAF
-- simulation outputs rather than observed facts.
update public.dca_source_registry
set source_status='live', last_checked_at=now(),
    notes='Closed 2026-08-26 as an operational governed family. Two cataloged observed municipal facts are live from the NJ DCA PILOT Database and Viewer 2026: reported PILOT record/project count and aggregate PILOT assessed value. The remaining eight catalog concepts are intentionally unavailable because they either require a legally undefined aggregation across multiple agreements/project types or are PFAF proposed-agreement simulation outputs rather than observed municipal facts. Watchdog does not synthesize those values.'
where source_id='nj-dca-pilot-forecast';
