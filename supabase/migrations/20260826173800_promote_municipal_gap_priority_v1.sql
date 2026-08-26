-- Promote two canonical municipal proprietary backlog models using already-live governed inputs.

insert into public.derived_formula_registry
  (marker_id,engine_version,formula,dependencies,confidence,status,explanation,operation,config,updated_at)
values
  (
    'watchdog.service_cost_ratable_gap',
    'watchdog-derived-v18-municipal-priority',
    'source_alias(budget.levy_base_gap)',
    array['budget.levy_base_gap']::text[],
    'high','live',
    'Exact municipal service-cost/ratable growth gap using the governed DCA budget model levy-growth minus ratable-growth percentage-point gap. Positive values mean levy growth is outpacing organic ratable growth; this is context, not a budget forecast.',
    'source_alias',jsonb_build_object('dep','budget.levy_base_gap'),now()
  ),
  (
    'watchdog.fiscal_intervention_priority',
    'watchdog-derived-v18-municipal-priority',
    'max(tax_base_absorption_risk, exemption_pressure_watch, tax_pressure, revaluation_risk)',
    array['watchdog.tax_base_absorption_risk','watchdog.municipal.exemption_pressure_watch','watchdog.tax_pressure','watchdog.revaluation_risk']::text[],
    'medium','live',
    'Municipal fiscal intervention priority is the maximum of four already-governed 0-100 pressure screens: tax-base absorption, exemption/abatement pressure, tax-rate pressure, and revaluation/reset risk. It ranks the strongest observed pressure for review and is not a fiscal distress determination.',
    'max_scores',
    jsonb_build_object('deps',jsonb_build_array('watchdog.tax_base_absorption_risk','watchdog.municipal.exemption_pressure_watch','watchdog.tax_pressure','watchdog.revaluation_risk'),'require_all',true,'precision',1),
    now()
  )
on conflict (marker_id) do update set
  engine_version=excluded.engine_version,formula=excluded.formula,dependencies=excluded.dependencies,
  confidence=excluded.confidence,status=excluded.status,explanation=excluded.explanation,
  operation=excluded.operation,config=excluded.config,updated_at=now();

insert into public.data_center_provider_coverage
  (marker_id,scopes,provider_key,value_status,source_keys,last_verified_at,notes,provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable)
values
  ('watchdog.service_cost_ratable_gap',array['municipality']::text[],'watchdog-derived','live',array['nj-dca-budget']::text[],now(),'Exact alias of the governed levy-growth minus ratable-growth gap.','derived_governed',array['budget.levy_base_gap']::text[],'watchdog-derived-v18-municipal-priority',21600,'refresh_on_demand',true),
  ('watchdog.fiscal_intervention_priority',array['municipality']::text[],'watchdog-derived','live',array['watchdog-derived']::text[],now(),'Maximum of four live governed municipal pressure screens; fail-closed when any required input is missing.','derived_governed',array['watchdog.tax_base_absorption_risk','watchdog.municipal.exemption_pressure_watch','watchdog.tax_pressure','watchdog.revaluation_risk']::text[],'watchdog-derived-v18-municipal-priority',21600,'refresh_on_demand',true)
on conflict (marker_id) do update set
  scopes=excluded.scopes,provider_key=excluded.provider_key,value_status=excluded.value_status,
  source_keys=excluded.source_keys,last_verified_at=excluded.last_verified_at,notes=excluded.notes,
  provider_kind=excluded.provider_kind,source_fields=excluded.source_fields,calculation_key=excluded.calculation_key,
  freshness_seconds=excluded.freshness_seconds,cache_policy=excluded.cache_policy,bulk_capable=excluded.bulk_capable;
