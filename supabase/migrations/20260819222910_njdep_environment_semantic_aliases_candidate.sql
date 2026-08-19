insert into public.derived_formula_registry
  (marker_id, engine_version, formula, dependencies, confidence, status, explanation, operation, config, updated_at)
values
  (
    'watchdog.njplus.environmental_record_resolution',
    'watchdog-derived-v15-strict-signal-count',
    'checked(kcsl_case_status, kcsl_program_interest, kcsl_site_id, deed_notice_reference, cea_reference, ust_facility_reference, brownfield_inventory_status, environmental_layer_vintage) / 8 * 100',
    array[
      'njplus.njdep-csrr-gis.kcsl_case_status',
      'njplus.njdep-csrr-gis.kcsl_program_interest',
      'njplus.njdep-csrr-gis.kcsl_site_id',
      'njplus.njdep-csrr-gis.deed_notice_reference',
      'njplus.njdep-csrr-gis.cea_reference',
      'njplus.njdep-csrr-gis.ust_facility_reference',
      'njplus.njdep-csrr-gis.brownfield_inventory_status',
      'njplus.njdep-csrr-gis.environmental_layer_vintage'
    ]::text[],
    'high',
    'live',
    'Percent of the exact parcel-attributed NJDEP CSRR facts for which the authoritative source was successfully checked. A checked no-record result counts as resolved source coverage; it is not environmental clearance.',
    'completeness',
    jsonb_build_object(
      'mode','checked',
      'requirements',jsonb_build_array(
        'njplus.njdep-csrr-gis.kcsl_case_status',
        'njplus.njdep-csrr-gis.kcsl_program_interest',
        'njplus.njdep-csrr-gis.kcsl_site_id',
        'njplus.njdep-csrr-gis.deed_notice_reference',
        'njplus.njdep-csrr-gis.cea_reference',
        'njplus.njdep-csrr-gis.ust_facility_reference',
        'njplus.njdep-csrr-gis.brownfield_inventory_status',
        'njplus.njdep-csrr-gis.environmental_layer_vintage'
      )
    ),
    now()
  ),
  (
    'watchdog.njplus.environmental_case_activity',
    'watchdog-derived-v15-strict-signal-count',
    'source_alias(njplus.njdep-csrr-gis.kcsl_case_status)',
    array['njplus.njdep-csrr-gis.kcsl_case_status']::text[],
    'high',
    'live',
    'Source-preserving alias to NJDEP CASE_STATUS for the exact parcel-attributed SRP case. Values such as Active, Active - Post Rem, Pending, Closed, or Transferred are returned unchanged; Watchdog does not convert them into a severity score.',
    'source_alias',
    '{"dep":"njplus.njdep-csrr-gis.kcsl_case_status"}'::jsonb,
    now()
  ),
  (
    'watchdog.njplus.brownfield_reuse_context',
    'watchdog-derived-v15-strict-signal-count',
    'source_alias(njplus.njdep-csrr-gis.brownfield_inventory_status)',
    array['njplus.njdep-csrr-gis.brownfield_inventory_status']::text[],
    'high',
    'live',
    'Source-preserving alias to the exact parcel-attributed NJDEP BROWNFIELDS_DEVELOPMENT_AREA field. BDA Case or Closed BDA Case is redevelopment-program context only, not a contamination, cleanup-completion, entitlement, or suitability determination.',
    'source_alias',
    '{"dep":"njplus.njdep-csrr-gis.brownfield_inventory_status"}'::jsonb,
    now()
  ),
  (
    'watchdog.njplus.environmental_source_currency',
    'watchdog-derived-v15-strict-signal-count',
    'source_alias(njplus.njdep-csrr-gis.environmental_layer_vintage)',
    array['njplus.njdep-csrr-gis.environmental_layer_vintage']::text[],
    'high',
    'live',
    'Source-preserving alias to the NJDEP environmental layer vintage exposed by the certified parcel resolver. The published vintage is returned unchanged rather than transformed into an arbitrary freshness score.',
    'source_alias',
    '{"dep":"njplus.njdep-csrr-gis.environmental_layer_vintage"}'::jsonb,
    now()
  )
on conflict (marker_id) do update set
  engine_version=excluded.engine_version,
  formula=excluded.formula,
  dependencies=excluded.dependencies,
  confidence=excluded.confidence,
  status=excluded.status,
  explanation=excluded.explanation,
  operation=excluded.operation,
  config=excluded.config,
  updated_at=excluded.updated_at;
