update public.data_center_provider_coverage
set value_status='live',
    provider_key='workbench-derived',
    provider_kind='derived_governed',
    calculation_key='watchdog-derived-v15-strict-signal-count',
    last_verified_at=now(),
    bulk_capable=false,
    notes='Authenticated production canary certified exact count(opportunity zone, urban enterprise zone, transit village, redevelopment area) on 2026-08-19. Engine v15 requires all four governed source checks before emitting the 0-4 count; any missing/failed dependency yields dependency_missing rather than a silent zero. Bulk remains uncertified.'
where marker_id='watchdog.njplus.development_designation_stack';

update public.derived_formula_registry
set engine_version='watchdog-derived-v15-strict-signal-count',
    updated_at=now()
where marker_id='watchdog.njplus.development_designation_stack'
  and operation='signal_count';
