-- Workbench v59 resolves the governed longitudinal history marker family from service-only score_history_metrics.
-- Missing repeated history remains dependency_missing; no trend is synthesized from one observation.
update public.derived_formula_registry
set status='live', updated_at=now(),
    explanation=regexp_replace(explanation,
      'Backend metric foundation exists; customer-facing runtime/catalog promotion remains gated\\.?',
      'Runtime-resolvable through authenticated Workbench history provider v59; requires at least two trusted observations where applicable.','gi')
where marker_id like 'watchdog.history.%'
  and engine_version='watchdog-history-v1';

update public.data_center_provider_coverage
set value_status='live', provider_key='watchdog-history-v1', provider_kind='derived_governed',
    calculation_key='watchdog-history-v1', last_verified_at=now(),
    notes=regexp_replace(notes,
      'Backend metric foundation exists; customer-facing runtime/catalog promotion remains gated\\.?',
      'Runtime-resolvable through authenticated Workbench history provider v59; missing repeated history returns dependency_missing.','gi')
where marker_id like 'watchdog.history.%'
  and calculation_key='watchdog-history-v1';
