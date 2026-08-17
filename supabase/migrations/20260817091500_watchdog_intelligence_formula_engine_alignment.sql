-- Watchdog Intelligence: keep formula registry metadata aligned with the deployed missing-safe derived runtime.

update public.derived_formula_registry
set engine_version='watchdog-derived-v4-missing-safe',
    updated_at=now()
where marker_id in ('watchdog.assessment_to_sale_ratio','watchdog.source_authority_coverage')
  and engine_version is distinct from 'watchdog-derived-v4-missing-safe';
