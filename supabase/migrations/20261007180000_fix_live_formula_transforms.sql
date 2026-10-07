-- Fix six live Data Center formulas that the workbench-derived engine could not read as written.
-- 1. 'inverse' is not a weighted_scores transform. The engine read it as a count with a cap of 1,
--    so any input of 1 or more scored 100. The registry formulas say "inverse", so use inverse_identity.
-- 2. 'inverse_count6' is not a transform either; the engine scored any constraint count of 1+ as 100,
--    the opposite of the intended "fewer constraints is clearer". A scaled helper now carries count6
--    and the clearance signal takes its inverse.
-- 3. fiscal_intervention_priority stored its inputs under "deps"; max_scores reads "items", so it never
--    returned a value. watchdog.tax_pressure comes from workbench-score, not workbench-derived, so it is
--    used when present instead of being required.

update public.derived_formula_registry d
set config = jsonb_set(d.config, '{items}', (
      select jsonb_agg(case when i->>'transform' = 'inverse' then jsonb_set(i, '{transform}', '"inverse_identity"') else i end order by ord)
      from jsonb_array_elements(d.config->'items') with ordinality as t(i, ord))),
    updated_at = now()
where d.status = 'live'
  and d.operation = 'weighted_scores'
  and d.marker_id in ('watchdog.appraiser.market_anchor_refresh','watchdog.consumer.sale_context_strength','watchdog.comparable_depth_score','watchdog.market_anchor_confidence')
  and exists (select 1 from jsonb_array_elements(d.config->'items') i where i->>'transform' = 'inverse');

insert into public.derived_formula_registry(marker_id,engine_version,formula,dependencies,confidence,status,explanation,operation,config,updated_at) values
('watchdog.internal.title_constraint_stack_scaled_v1','watchdog-derived-v24-njw294','min(title_constraint_stack / 6, 1) * 100',array['watchdog.title_constraint_stack']::text[],'high','live','Internal helper: the title constraint count scaled to 0-100 with 6 or more constraints at 100.','weighted_signals',
  jsonb_build_object('signals', jsonb_build_array(jsonb_build_object('dep','watchdog.title_constraint_stack','weight',100,'transform','count6'))),now())
on conflict(marker_id) do update set engine_version=excluded.engine_version,formula=excluded.formula,dependencies=excluded.dependencies,confidence=excluded.confidence,status=excluded.status,explanation=excluded.explanation,operation=excluded.operation,config=excluded.config,updated_at=now();

update public.derived_formula_registry
set config = jsonb_build_object('items', jsonb_build_array(
      jsonb_build_object('dep','watchdog.parcel_identity_confidence','weight',40,'transform','identity'),
      jsonb_build_object('dep','watchdog.permit_closure_confidence','weight',35,'transform','identity'),
      jsonb_build_object('dep','watchdog.internal.title_constraint_stack_scaled_v1','weight',25,'transform','inverse_identity')),
      'require_all', true),
    dependencies = array['watchdog.parcel_identity_confidence','watchdog.permit_closure_confidence','watchdog.internal.title_constraint_stack_scaled_v1']::text[],
    updated_at = now()
where marker_id = 'watchdog.title.closing_clearance_signal' and status = 'live';

update public.derived_formula_registry
set config = jsonb_build_object('items', jsonb_build_array(
      jsonb_build_object('dep','watchdog.tax_base_absorption_risk','transform','identity'),
      jsonb_build_object('dep','watchdog.municipal.exemption_pressure_watch','transform','identity'),
      jsonb_build_object('dep','watchdog.tax_pressure','transform','identity'),
      jsonb_build_object('dep','watchdog.revaluation_risk','transform','identity')),
      'require_all', false),
    explanation = 'Highest available of tax-base absorption risk, exemption pressure, tax pressure and revaluation risk. Tax pressure is included when the Watchdog Score engine has computed it for the property.',
    updated_at = now()
where marker_id = 'watchdog.fiscal_intervention_priority' and status = 'live';
