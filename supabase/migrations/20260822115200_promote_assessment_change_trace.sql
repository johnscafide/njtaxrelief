-- Promote Assessment Change Trace only after its governed formula and source-history dependencies are live.
-- Production authenticated structured canary control: PAMS 0101_25.01_10 / Absecon City.
-- Canary request 1834 returned the exact 2021-2026 ordered rows with no missing-year synthesis.
-- This marker is evidence organization, not a numeric score.

do $$
begin
  if not exists (
    select 1
    from public.derived_formula_registry
    where marker_id = 'watchdog.njplus.assessment_change_trace'
      and status = 'live'
      and confidence = 'high'
      and operation = 'ordered_history'
      and formula = 'ordered_history(assessment_land_history, assessment_improvement_history, assessment_total_history)'
      and config->>'output_contract' = 'ordered_assessment_history_v1'
      and config->>'missing_year_policy' = 'absent_not_synthesized'
  ) then
    raise exception 'Assessment Change Trace governed formula contract is not live';
  end if;

  if (
    select count(*)
    from public.data_center_provider_coverage
    where marker_id in (
      'njplus.nj-dca-modiv-longitudinal.assessment_land_history',
      'njplus.nj-dca-modiv-longitudinal.assessment_improvement_history',
      'njplus.nj-dca-modiv-longitudinal.assessment_total_history'
    )
      and value_status = 'live'
      and provider_kind = 'authoritative_reference'
  ) <> 3 then
    raise exception 'Assessment Change Trace source-history dependencies are not all live authoritative references';
  end if;
end $$;

insert into public.data_center_provider_coverage
(marker_id,scopes,provider_key,value_status,source_keys,last_verified_at,notes,provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable)
values
(
  'watchdog.njplus.assessment_change_trace',array['property'],'workbench-derived','live',
  array['nj-dca-modiv-longitudinal','treasury-modiv-2021-2026-v2'],now(),
  'Chronological assessment evidence assembled from the certified MOD-IV land, improvement, and total histories. Authenticated production structured canary request 1834 verified exact 2021-2026 rows for Absecon control 0101_25.01_10. Only actual source years are emitted; missing years are never synthesized, and a missing component inside a real source year remains null. This is evidence organization, not a score.',
  'derived_governed',array['assessment_land_history','assessment_improvement_history','assessment_total_history'],
  'ordered-assessment-history-v1',21600,'refresh_on_demand',false
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
