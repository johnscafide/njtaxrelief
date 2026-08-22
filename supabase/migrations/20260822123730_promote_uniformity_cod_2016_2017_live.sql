insert into public.data_center_provider_coverage (
  marker_id, scopes, provider_key, value_status, source_keys, last_verified_at, notes,
  provider_kind, source_fields, calculation_key, freshness_seconds, cache_policy, bulk_capable
) values
(
  'uniformity.cod_2016', array['property','town'], 'workbench-hydrate', 'live',
  array['NJ Division of Taxation Measures of Property Assessment Uniformity - 2017 county tables'],
  now(),
  'Published 2016 segmented coefficient of deviation for Property Class 2 (Residential), keyed by official four-digit NJ C/D district code. Recovered from all 21 official 2017 county tables with exact uploaded-file SHA-256 checks and exact reconciliation from 565 historical municipality rows to the current 564-district identity plane; Pine Valley Borough is retained only as a retired blank identity. Authenticated production canary uniformity_history_v3 request 1848 verified Absecon 0101 at 14.02 with authoritative provenance.',
  'authoritative_reference', array['historical-cod-2016-2017.series.2016'],
  'nj-cod-segmented-class2-v1', 21600, 'refresh_on_demand', true
),
(
  'uniformity.cod_2017', array['property','town'], 'workbench-hydrate', 'live',
  array['NJ Division of Taxation Measures of Property Assessment Uniformity - 2017 county tables'],
  now(),
  'Published 2017 segmented coefficient of deviation for Property Class 2 (Residential), keyed by official four-digit NJ C/D district code. Recovered from all 21 official 2017 county tables with exact uploaded-file SHA-256 checks and exact reconciliation from 565 historical municipality rows to the current 564-district identity plane; Pine Valley Borough is retained only as a retired blank identity. Authenticated production canary uniformity_history_v3 request 1848 verified Absecon 0101 at 14.45 with authoritative provenance. Source blanks remain unavailable and genuine printed 0.00 values with positive Class 2 sales remain real zeroes.',
  'authoritative_reference', array['historical-cod-2016-2017.series.2017'],
  'nj-cod-segmented-class2-v1', 21600, 'refresh_on_demand', true
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
