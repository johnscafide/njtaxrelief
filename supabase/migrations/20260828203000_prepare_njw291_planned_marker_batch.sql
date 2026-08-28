-- NJW-291 candidate formulas. Provider coverage is promoted only after production canary evidence.
-- Extend the governed operation allowlist rather than bypassing formula-registry validation.
alter table public.derived_formula_registry drop constraint if exists derived_formula_registry_operation_check;
alter table public.derived_formula_registry add constraint derived_formula_registry_operation_check check (
  operation is null or operation = any (array[
    'year_delta'::text,'ratio'::text,'completeness'::text,'inverse'::text,
    'permit_closure'::text,'permit_activity'::text,'weighted_signals'::text,
    'signal_count'::text,'signal_density'::text,'weighted_scores'::text,
    'max_scores'::text,'product_scores'::text,'tax_rate_position'::text,
    'municipal_cost_absorption'::text,'fiscal_resilience'::text,
    'revaluation_pressure'::text,'transaction_tax_shock'::text,
    'investor_carry_volatility'::text,'tax_reset_sensitivity'::text,
    'marketability_drag'::text,'sr1a_subject_square_feet'::text,
    'comparable_evidence_reliability'::text,'assessment_defensibility'::text,
    'appeal_evidence_strength'::text,'appeal_opportunity'::text,
    'source_alias'::text,'chapter123_field'::text,'ordered_history'::text,
    'history_metric'::text,'chapter123_position'::text,'assessment_component_shift'::text
  ])
);

insert into public.derived_formula_registry(marker_id,engine_version,formula,dependencies,confidence,status,explanation,operation,config,updated_at) values
('watchdog.chapter123_position','watchdog-derived-v22-njw291','assessment / (municipal verified-sales PPSF * matched subject living space) * 100, positioned against the official 2026 Chapter 123 lower and upper bounds',array['property.assessed_value','sales.ppsf']::text[],'high','live','Public-record screening position within the official Chapter 123 corridor. Returns below_lower_bound, within_common_level_range, or above_upper_bound. It is not appeal eligibility, legal advice, an appraisal, or a value conclusion.','chapter123_position',jsonb_build_object('assessed_dep','property.assessed_value','ppsf_dep','sales.ppsf'),now()),
('watchdog.njplus.assessment_component_shift','watchdog-derived-v22-njw291','latest consecutive MOD-IV transition: 50 + ((change in land share pp - change in improvement share pp) / 4), clamped 0-100',array['njplus.nj-dca-modiv-longitudinal.assessment_land_history','njplus.nj-dca-modiv-longitudinal.assessment_improvement_history']::text[],'high','live','Directional assessment-composition index from actual consecutive published MOD-IV observations only. 50 means no composition shift; above 50 shifts toward land; below 50 shifts toward improvements. Missing years are never synthesized.','assessment_component_shift',jsonb_build_object('land_dep','njplus.nj-dca-modiv-longitudinal.assessment_land_history','improvement_dep','njplus.nj-dca-modiv-longitudinal.assessment_improvement_history','neutral_score',50,'normalization_min_differential_pp',-200,'normalization_max_differential_pp',200,'require_consecutive_years',true),now())
on conflict(marker_id) do update set engine_version=excluded.engine_version,formula=excluded.formula,dependencies=excluded.dependencies,confidence=excluded.confidence,status=excluded.status,explanation=excluded.explanation,operation=excluded.operation,config=excluded.config,updated_at=now();
