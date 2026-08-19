begin;

insert into public.derived_formula_registry(
  marker_id,
  engine_version,
  formula,
  dependencies,
  confidence,
  status,
  explanation,
  operation,
  config
)
values (
  'watchdog.closing_exception_priority_vnext',
  'watchdog-derived-v10-appraisal-evidence',
  '30% open-permit screen + 25% title constraints + 25% environmental screen + 20% flood/environment screen; all four governed families required before scoring',
  array[
    'preflight.open_permit_count',
    'watchdog.title_constraint_stack',
    'watchdog.environmental_encumbrance_severity',
    'watchdog.flood_environment_risk_score'
  ],
  'medium',
  'live',
  'Draft Closing vNext exception aggregate. Refuses partial evidence so unresolved spatial/title families cannot be silently renormalized into a lower or higher closing score.',
  'weighted_scores',
  jsonb_build_object(
    'require_all', true,
    'items', jsonb_build_array(
      jsonb_build_object('dep','preflight.open_permit_count','weight',30,'transform','count10'),
      jsonb_build_object('dep','watchdog.title_constraint_stack','weight',25,'transform','count6'),
      jsonb_build_object('dep','watchdog.environmental_encumbrance_severity','weight',25,'transform','identity'),
      jsonb_build_object('dep','watchdog.flood_environment_risk_score','weight',20,'transform','identity')
    )
  )
)
on conflict (marker_id) do update
set engine_version = excluded.engine_version,
    formula = excluded.formula,
    dependencies = excluded.dependencies,
    confidence = excluded.confidence,
    status = excluded.status,
    explanation = excluded.explanation,
    operation = excluded.operation,
    config = excluded.config,
    updated_at = now();

insert into public.intelligence_feature_versions(
  feature_key,
  version,
  source_key,
  label,
  transform_type,
  config,
  direction,
  status,
  explanation
)
values (
  'watchdog.closing_exception_attention_vnext',
  2,
  'watchdog.closing_exception_priority_vnext',
  'Closing exception attention (vNext complete evidence)',
  'count_cap',
  jsonb_build_object('cap',30),
  'higher_attention',
  'draft',
  'Draft vNext normalization uses the complete-evidence closing exception aggregate. Partial permit/title/environment/flood evidence remains unavailable rather than being renormalized.'
)
on conflict (feature_key, version) do update
set source_key = excluded.source_key,
    label = excluded.label,
    transform_type = excluded.transform_type,
    config = excluded.config,
    direction = excluded.direction,
    status = excluded.status,
    explanation = excluded.explanation;

commit;
