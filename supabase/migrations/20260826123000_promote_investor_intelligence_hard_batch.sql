-- Difficult investor / portfolio intelligence batch.
-- Uses only already-governed live 0-100 signals or published shares.
-- These are transparent screening models, not investment recommendations or calibrated return forecasts.

insert into public.derived_formula_registry
(marker_id,engine_version,formula,dependencies,confidence,status,explanation,operation,config,updated_at)
values
(
  'watchdog.investor.exit_liquidity_score','watchdog-derived-v17-investor-hard',
  '40% inverse marketability drag + 25% property story confidence + 20% inverse carry-cost volatility + 15% inverse asset-constraint screen',
  array['watchdog.marketability_drag_index','watchdog.property_story_confidence','watchdog.investor_carry_cost_volatility','watchdog.investor.asset_constraint_screen'],
  'medium','live',
  'Investor exit-liquidity screening score. Higher values indicate fewer currently governed public-record frictions. It combines the inverse of Watchdog marketability drag, sourced property-story confidence, inverse tax-driven carry-cost volatility, and inverse governed mapped constraint density. All four inputs are required. This is not a prediction of sale timing, price, or buyer demand.',
  'weighted_scores',
  '{"require_all":true,"items":[{"dep":"watchdog.marketability_drag_index","weight":40,"transform":"inverse_identity"},{"dep":"watchdog.property_story_confidence","weight":25,"transform":"identity"},{"dep":"watchdog.investor_carry_cost_volatility","weight":20,"transform":"inverse_identity"},{"dep":"watchdog.investor.asset_constraint_screen","weight":15,"transform":"inverse_identity"}]}'::jsonb,
  now()
),
(
  'watchdog.investor.municipal_fiscal_beta','watchdog-derived-v17-investor-hard',
  '55% tax-base absorption risk + 30% carry-cost volatility + 15% revaluation pressure',
  array['watchdog.tax_base_absorption_risk','watchdog.investor_carry_cost_volatility','watchdog.revaluation_risk'],
  'medium','live',
  'Municipal fiscal beta is a Watchdog screening score for property-tax sensitivity to local levy/base imbalance and reset pressure. Tax Base Absorption Risk receives the largest weight because it directly measures positive levy growth over ratable-base growth; carry-cost volatility contributes broader municipal tax pressure, and revaluation pressure captures reset sensitivity. All inputs are required. This is not a statistical market beta or tax forecast.',
  'weighted_scores',
  '{"require_all":true,"items":[{"dep":"watchdog.tax_base_absorption_risk","weight":55,"transform":"identity"},{"dep":"watchdog.investor_carry_cost_volatility","weight":30,"transform":"identity"},{"dep":"watchdog.revaluation_risk","weight":15,"transform":"identity"}]}'::jsonb,
  now()
),
(
  'watchdog.investor.portfolio_data_confidence','watchdog-derived-v17-investor-hard',
  '45% property story confidence + 30% physical-risk source coverage + 25% municipal source coverage',
  array['watchdog.property_story_confidence','watchdog.insurance.physical_record_coverage','watchdog.municipal.municipal_source_coverage'],
  'high','live',
  'Portfolio Data Confidence measures evidence coverage, not investment quality. It combines governed parcel/story confidence, public physical-risk source coverage, and municipal source coverage. All inputs are required and no missing evidence is imputed.',
  'weighted_scores',
  '{"require_all":true,"items":[{"dep":"watchdog.property_story_confidence","weight":45,"transform":"identity"},{"dep":"watchdog.insurance.physical_record_coverage","weight":30,"transform":"identity"},{"dep":"watchdog.municipal.municipal_source_coverage","weight":25,"transform":"identity"}]}'::jsonb,
  now()
),
(
  'watchdog.investor.redevelopment_incentive_exposure','watchdog-derived-v17-investor-hard',
  '50% normalized PILOT value share + 50% normalized abated share',
  array['exemption.pilot_value_share','abatement.abated_share'],
  'medium','live',
  'Redevelopment Incentive Exposure is a municipal context screen using the two governed incentive-related tax-base shares currently available to Watchdog. Both shares use the existing 35% full-scale normalization already used for exemption-pressure screening. It does not infer eligibility, agreement terms, expiration, competitive advantage, or future taxes.',
  'weighted_scores',
  '{"require_all":true,"items":[{"dep":"exemption.pilot_value_share","weight":50,"transform":"share35"},{"dep":"abatement.abated_share","weight":50,"transform":"share35"}]}'::jsonb,
  now()
)
on conflict(marker_id) do update set
  engine_version=excluded.engine_version,formula=excluded.formula,dependencies=excluded.dependencies,
  confidence=excluded.confidence,status=excluded.status,explanation=excluded.explanation,
  operation=excluded.operation,config=excluded.config,updated_at=now();

insert into public.data_center_provider_coverage
(marker_id,scopes,provider_key,value_status,source_keys,last_verified_at,notes,provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable)
values
('watchdog.investor.exit_liquidity_score',array['property','town'],'watchdog-derived','live',array['Watchdog governed marketability, property evidence, fiscal, and mapped-constraint signals'],now(),'Governed investor exit-liquidity screening score; all four inputs required; not a saleability forecast.','derived_governed',array['watchdog.marketability_drag_index','watchdog.property_story_confidence','watchdog.investor_carry_cost_volatility','watchdog.investor.asset_constraint_screen'],'watchdog-derived-v17-investor-hard',21600,'refresh_on_demand',true),
('watchdog.investor.municipal_fiscal_beta',array['property','town'],'watchdog-derived','live',array['NJ DCA municipal budget/ratable data','NJ Division of Taxation Chapter 123','Watchdog governed fiscal models'],now(),'Governed municipal tax-sensitivity screen; not a statistical beta or tax forecast.','derived_governed',array['watchdog.tax_base_absorption_risk','watchdog.investor_carry_cost_volatility','watchdog.revaluation_risk'],'watchdog-derived-v17-investor-hard',21600,'refresh_on_demand',true),
('watchdog.investor.portfolio_data_confidence',array['property','town'],'watchdog-derived','live',array['NJOGIS/MOD-IV','NJDEP/FEMA/DCA governed public sources','Watchdog source-coverage models'],now(),'Evidence-coverage score only; no investment-quality inference.','derived_governed',array['watchdog.property_story_confidence','watchdog.insurance.physical_record_coverage','watchdog.municipal.municipal_source_coverage'],'watchdog-derived-v17-investor-hard',21600,'refresh_on_demand',true),
('watchdog.investor.redevelopment_incentive_exposure',array['town'],'watchdog-derived','live',array['NJ Division of Taxation Abstract of Ratables','NJ DCA PILOT data'],now(),'Municipal incentive-context screen from governed PILOT and abated tax-base shares; does not infer eligibility or agreement terms.','derived_governed',array['exemption.pilot_value_share','abatement.abated_share'],'watchdog-derived-v17-investor-hard',21600,'refresh_on_demand',true)
on conflict(marker_id) do update set
  scopes=excluded.scopes,provider_key=excluded.provider_key,value_status=excluded.value_status,
  source_keys=excluded.source_keys,last_verified_at=excluded.last_verified_at,notes=excluded.notes,
  provider_kind=excluded.provider_kind,source_fields=excluded.source_fields,calculation_key=excluded.calculation_key,
  freshness_seconds=excluded.freshness_seconds,cache_policy=excluded.cache_policy,bulk_capable=excluded.bulk_capable;
