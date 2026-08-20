-- Promote uniformity.cod_2022 only after the authenticated
-- uniformity_history_v1 production canary passed.
--
-- Evidence control: PAMS 0101_25.01_10 / Absecon City
-- expected and returned uniformity.cod_2022 = 18.09
-- provider_kind = authoritative_reference
-- source = NJ Division of Taxation assessment uniformity
--
-- Missing-semantics control in the same signed-in canary:
-- uniformity.cod_2016 returned no value with status=source_checked_no_value;
-- no synthetic zero was emitted.

insert into public.data_center_provider_coverage
(marker_id,scopes,provider_key,value_status,source_keys,last_verified_at,notes,provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable)
values
(
  'uniformity.cod_2022',array['property','town'],'workbench-hydrate','live',
  array['NJ Division of Taxation Measures of Property Assessment Uniformity'],now(),
  'Published 2022 segmented coefficient of deviation for Property Class 2 (Residential), keyed by four-digit NJ district code. Authenticated production canary uniformity_history_v1 verified Absecon City 0101 at 18.09 with authoritative provenance and verified that unavailable historical years do not receive synthetic zero values.',
  'authoritative_reference',array['series.2022'],
  'nj-cod-segmented-class2-v1',21600,'refresh_on_demand',true
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
