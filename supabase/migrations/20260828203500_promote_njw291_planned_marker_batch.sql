-- NJW-291 production coverage promotion after authenticated release canary request 4236 passed.
-- Canary assertions: uniformity percentile 29 == 29; assessment component shift 50 == 50;
-- Chapter 123 position within_common_level_range == within_common_level_range; mismatches=[]; no_real_spend=true.
insert into public.data_center_provider_coverage
(marker_id,scopes,provider_key,value_status,source_keys,last_verified_at,notes,provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable)
values
(
 'uniformity.percentile',
 array['property','town']::text[],
 'workbench-hydrate',
 'live',
 array['NJ Division of Taxation Measures of Property Assessment Uniformity']::text[],
 now(),
 'Authenticated production canary planned_marker_batch_v1 request 4236 reproduced Absecon district 0101 percentile 29 exactly from the canonical governed uniformity artifact, with derived_governed provenance. This is Watchdog statewide percentile ranking of the governed Assessment Uniformity Score, not a raw state-published percentile.',
 'derived_governed',
 array['score','percentile']::text[],
 'watchdog-uniformity-percentile-v1',
 21600,
 'refresh_on_demand',
 false
),
(
 'watchdog.chapter123_position',
 array['property']::text[],
 'watchdog-derived',
 'live',
 array['NJ Division of Taxation SR-1A verified sales','NJ Division of Taxation 2026 Chapter 123','NJOGIS Parcels / MOD-IV Composite']::text[],
 now(),
 'Authenticated production canary planned_marker_batch_v1 request 4236 reproduced Gloucester control 0818_242_22 at 54.37% and within_common_level_range against the official 2026 Chapter 123 corridor 50.50%-68.32%, with matched SR-1A subject evidence and derived_governed provenance. Screening context only; not appeal eligibility, legal advice, an appraisal, or a value conclusion.',
 'derived_governed',
 array['property.assessed_value','sales.ppsf','sr1a_subject_evidence.living_space','chapter123.lower','chapter123.upper']::text[],
 'watchdog-derived-v22-njw291',
 21600,
 'refresh_on_demand',
 true
),
(
 'watchdog.njplus.assessment_component_shift',
 array['property']::text[],
 'watchdog-derived',
 'live',
 array['nj-dca-modiv-longitudinal','treasury-modiv-2021-2026-v2']::text[],
 now(),
 'Authenticated production canary planned_marker_batch_v1 request 4236 reproduced the exact latest-consecutive-year MOD-IV component-share calculation for control 0101_25.01_10: 2025-2026 expected 50.0, actual 50.0, derived_governed. Missing years are never synthesized; 50 is unchanged composition, above 50 shifts toward land, below 50 shifts toward improvements.',
 'derived_governed',
 array['assessment_land_history','assessment_improvement_history']::text[],
 'watchdog-derived-v22-njw291',
 21600,
 'refresh_on_demand',
 false
)
on conflict(marker_id) do update set
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
