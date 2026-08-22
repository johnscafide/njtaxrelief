alter table public.derived_formula_registry
  drop constraint if exists derived_formula_registry_operation_check;

alter table public.derived_formula_registry
  add constraint derived_formula_registry_operation_check
  check (
    operation is null or operation = any (array[
      'year_delta','ratio','completeness','inverse','permit_closure','permit_activity',
      'weighted_signals','signal_count','signal_density','weighted_scores','max_scores',
      'product_scores','tax_rate_position','municipal_cost_absorption','fiscal_resilience',
      'revaluation_pressure','transaction_tax_shock','investor_carry_volatility',
      'tax_reset_sensitivity','marketability_drag','sr1a_subject_square_feet',
      'comparable_evidence_reliability','assessment_defensibility','appeal_evidence_strength',
      'appeal_opportunity','source_alias','chapter123_field','ordered_history'
    ]::text[])
  );

do $block$
begin
  if exists (
    select 1 from public.derived_formula_registry
    where marker_id='watchdog.njplus.assessment_change_trace'
  ) then
    raise exception 'assessment_change_trace formula already exists; refusing concurrent overwrite';
  end if;

  if (
    select count(*) from public.data_center_provider_coverage
    where marker_id in (
      'njplus.nj-dca-modiv-longitudinal.assessment_land_history',
      'njplus.nj-dca-modiv-longitudinal.assessment_improvement_history',
      'njplus.nj-dca-modiv-longitudinal.assessment_total_history'
    )
      and value_status='live'
      and provider_kind='authoritative_reference'
  ) <> 3 then
    raise exception 'assessment_change_trace requires all three certified MOD-IV history dependencies';
  end if;

  insert into public.derived_formula_registry
    (marker_id,engine_version,formula,dependencies,confidence,status,explanation,operation,config)
  values (
    'watchdog.njplus.assessment_change_trace',
    'watchdog-derived-v16-chapter123-fields',
    'ordered_history(assessment_land_history, assessment_improvement_history, assessment_total_history)',
    array[
      'njplus.nj-dca-modiv-longitudinal.assessment_land_history',
      'njplus.nj-dca-modiv-longitudinal.assessment_improvement_history',
      'njplus.nj-dca-modiv-longitudinal.assessment_total_history'
    ],
    'high',
    'live',
    'Chronological MOD-IV assessment trace using only parcel-years actually present in the certified source histories. Each row contains year, land, improvement, and total; a component may be null only when that component is absent within a real source year. Entire missing years are never synthesized. This is evidence organization, not a score.',
    'ordered_history',
    jsonb_build_object(
      'land_dep','njplus.nj-dca-modiv-longitudinal.assessment_land_history',
      'improvement_dep','njplus.nj-dca-modiv-longitudinal.assessment_improvement_history',
      'total_dep','njplus.nj-dca-modiv-longitudinal.assessment_total_history',
      'output_contract','ordered_assessment_history_v1',
      'missing_year_policy','absent_not_synthesized',
      'missing_component_policy','null_within_real_year'
    )
  );
end;
$block$;
