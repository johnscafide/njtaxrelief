-- Watchdog seven-category professional intelligence batch.
-- Uses only already-live governed signals and existing weighted_scores runtime support.
-- All models fail closed when required dependencies are missing.

insert into public.derived_formula_registry
(marker_id,engine_version,formula,dependencies,confidence,status,explanation,operation,config,updated_at)
values
(
  'watchdog.consumer.tax_change_watch','watchdog-derived-v19-seven-category-batch',
  '40% tax trend position + 30% municipal budget pressure + 30% revaluation risk',
  array['watchdog.tax_trend_position','budget.pressure_score','watchdog.revaluation_risk']::text[],
  'medium','live',
  'Consumer-facing v1 tax-change review signal using governed public tax trend, municipal budget pressure and revaluation/reset pressure. This narrows the legacy levy-growth wording to already-governed fiscal pressure rather than inventing a separate levy-growth model. It is a review-priority signal, not a tax forecast.',
  'weighted_scores',
  '{"require_all":true,"items":[{"dep":"watchdog.tax_trend_position","weight":40,"transform":"identity"},{"dep":"budget.pressure_score","weight":30,"transform":"identity"},{"dep":"watchdog.revaluation_risk","weight":30,"transform":"identity"}]}'::jsonb,now()
),
(
  'watchdog.attorney.environmental_exception_path','watchdog-derived-v19-seven-category-batch',
  '50% environmental encumbrance severity + 25% water protection context + 25% geology hazard context',
  array['watchdog.environmental_encumbrance_severity','watchdog.insurance.water_protection_context','watchdog.insurance.geology_hazard_context']::text[],
  'medium','live',
  'Attorney-facing environmental review priority using three governed public-record risk contexts. This is a v1 screening path and does not determine legal encumbrance, liability, remediation duty or site suitability.',
  'weighted_scores',
  '{"require_all":true,"items":[{"dep":"watchdog.environmental_encumbrance_severity","weight":50,"transform":"identity"},{"dep":"watchdog.insurance.water_protection_context","weight":25,"transform":"identity"},{"dep":"watchdog.insurance.geology_hazard_context","weight":25,"transform":"identity"}]}'::jsonb,now()
),
(
  'watchdog.title.closing_clearance_signal','watchdog-derived-v19-seven-category-batch',
  '40% parcel identity confidence + 35% permit closure confidence + 25% inverse normalized title-constraint stack',
  array['watchdog.parcel_identity_confidence','watchdog.permit_closure_confidence','watchdog.title_constraint_stack']::text[],
  'medium','live',
  'Title-facing public-record clearance triage signal. The title-constraint stack is normalized on the existing six-signal scale and inverted so higher values mean cleaner public-record context. This is not a title opinion, lien search or closing clearance.',
  'weighted_scores',
  '{"require_all":true,"items":[{"dep":"watchdog.parcel_identity_confidence","weight":40,"transform":"identity"},{"dep":"watchdog.permit_closure_confidence","weight":35,"transform":"identity"},{"dep":"watchdog.title_constraint_stack","weight":25,"transform":"inverse_count6"}]}'::jsonb,now()
),
(
  'watchdog.agent.seller_tax_story_stability','watchdog-derived-v19-seven-category-batch',
  '55% tax trend position + 45% inverse revaluation conversation risk',
  array['watchdog.tax_trend_position','watchdog.revaluation_conversation_risk']::text[],
  'medium','live',
  'Agent-facing seller tax-story stability signal using governed tax-trend context and inverse revaluation-conversation risk. It supports a sourced client conversation and is not a prediction of buyer reaction or future taxes.',
  'weighted_scores',
  '{"require_all":true,"items":[{"dep":"watchdog.tax_trend_position","weight":55,"transform":"identity"},{"dep":"watchdog.revaluation_conversation_risk","weight":45,"transform":"inverse_identity"}]}'::jsonb,now()
),
(
  'watchdog.lender.revaluation_payment_risk','watchdog-derived-v19-seven-category-batch',
  '55% collateral tax-reset sensitivity + 45% revaluation reset exposure',
  array['watchdog.collateral_tax_reset_sensitivity','watchdog.revaluation_reset_exposure']::text[],
  'medium','live',
  'Lender-facing public property-tax reset attention signal combining two governed collateral/revaluation contexts. This is not borrower underwriting, payment qualification, escrow advice or a tax-payment forecast.',
  'weighted_scores',
  '{"require_all":true,"items":[{"dep":"watchdog.collateral_tax_reset_sensitivity","weight":55,"transform":"identity"},{"dep":"watchdog.revaluation_reset_exposure","weight":45,"transform":"identity"}]}'::jsonb,now()
),
(
  'watchdog.appraiser.comparable_screen_priority','watchdog-derived-v19-seven-category-batch',
  '60% inverse comparable evidence quality + 40% public appraisal input gap',
  array['watchdog.comparable_evidence_quality','watchdog.appraiser.public_input_gap']::text[],
  'medium','live',
  'Appraiser-facing v1 comparable-screen priority. Higher values mean the public comparable evidence is weaker or appraisal inputs are less complete, warranting deeper professional comparable work. It does not select comps, adjust value or provide an appraisal conclusion.',
  'weighted_scores',
  '{"require_all":true,"items":[{"dep":"watchdog.comparable_evidence_quality","weight":60,"transform":"inverse_identity"},{"dep":"watchdog.appraiser.public_input_gap","weight":40,"transform":"identity"}]}'::jsonb,now()
),
(
  'watchdog.municipal.fiscal_monitor_priority','watchdog-derived-v19-seven-category-batch',
  '35% inverse levy alignment + 35% exemption pressure + 30% municipal fiscal beta',
  array['watchdog.municipal.levy_alignment_score','watchdog.municipal.exemption_pressure_watch','watchdog.municipal_fiscal_beta']::text[],
  'medium','live',
  'Municipal monitoring priority combining levy/base misalignment, exemption/PILOT/abatement pressure and governed municipal fiscal sensitivity. This v1 model substitutes the broader governed fiscal-beta context for the legacy unimplemented debt-service-attention submodel; it is not a credit rating or fiscal forecast.',
  'weighted_scores',
  '{"require_all":true,"items":[{"dep":"watchdog.municipal.levy_alignment_score","weight":35,"transform":"inverse_identity"},{"dep":"watchdog.municipal.exemption_pressure_watch","weight":35,"transform":"identity"},{"dep":"watchdog.municipal_fiscal_beta","weight":30,"transform":"identity"}]}'::jsonb,now()
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
  updated_at=now();

insert into public.data_center_provider_coverage
(marker_id,scopes,provider_key,value_status,source_keys,last_verified_at,notes,provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable)
values
('watchdog.consumer.tax_change_watch',array['property','town']::text[],'watchdog-derived','live',array['watchdog.tax_trend_position','budget.pressure_score','watchdog.revaluation_risk']::text[],now(),'Governed consumer tax-change review signal; not a tax forecast.','derived_governed',array['watchdog.tax_trend_position','budget.pressure_score','watchdog.revaluation_risk']::text[],'watchdog-derived-v19-seven-category-batch',21600,'refresh_on_demand',true),
('watchdog.attorney.environmental_exception_path',array['property']::text[],'watchdog-derived','live',array['watchdog.environmental_encumbrance_severity','watchdog.insurance.water_protection_context','watchdog.insurance.geology_hazard_context']::text[],now(),'Governed environmental review-priority path; not a legal or liability determination.','derived_governed',array['watchdog.environmental_encumbrance_severity','watchdog.insurance.water_protection_context','watchdog.insurance.geology_hazard_context']::text[],'watchdog-derived-v19-seven-category-batch',21600,'refresh_on_demand',true),
('watchdog.title.closing_clearance_signal',array['property']::text[],'watchdog-derived','live',array['watchdog.parcel_identity_confidence','watchdog.permit_closure_confidence','watchdog.title_constraint_stack']::text[],now(),'Governed public-record title/closing triage; not title clearance.','derived_governed',array['watchdog.parcel_identity_confidence','watchdog.permit_closure_confidence','watchdog.title_constraint_stack']::text[],'watchdog-derived-v19-seven-category-batch',21600,'refresh_on_demand',true),
('watchdog.agent.seller_tax_story_stability',array['property','town']::text[],'watchdog-derived','live',array['watchdog.tax_trend_position','watchdog.revaluation_conversation_risk']::text[],now(),'Governed seller tax-story context for agent conversations.','derived_governed',array['watchdog.tax_trend_position','watchdog.revaluation_conversation_risk']::text[],'watchdog-derived-v19-seven-category-batch',21600,'refresh_on_demand',true),
('watchdog.lender.revaluation_payment_risk',array['property','town']::text[],'watchdog-derived','live',array['watchdog.collateral_tax_reset_sensitivity','watchdog.revaluation_reset_exposure']::text[],now(),'Governed property-tax reset attention signal; not borrower underwriting.','derived_governed',array['watchdog.collateral_tax_reset_sensitivity','watchdog.revaluation_reset_exposure']::text[],'watchdog-derived-v19-seven-category-batch',21600,'refresh_on_demand',true),
('watchdog.appraiser.comparable_screen_priority',array['property','town']::text[],'watchdog-derived','live',array['watchdog.comparable_evidence_quality','watchdog.appraiser.public_input_gap']::text[],now(),'Governed public comparable-screen priority; not comp selection or appraisal.','derived_governed',array['watchdog.comparable_evidence_quality','watchdog.appraiser.public_input_gap']::text[],'watchdog-derived-v19-seven-category-batch',21600,'refresh_on_demand',true),
('watchdog.municipal.fiscal_monitor_priority',array['municipality','town']::text[],'watchdog-derived','live',array['watchdog.municipal.levy_alignment_score','watchdog.municipal.exemption_pressure_watch','watchdog.municipal_fiscal_beta']::text[],now(),'Governed municipal fiscal monitoring priority; not a rating or fiscal forecast.','derived_governed',array['watchdog.municipal.levy_alignment_score','watchdog.municipal.exemption_pressure_watch','watchdog.municipal_fiscal_beta']::text[],'watchdog-derived-v19-seven-category-batch',21600,'refresh_on_demand',true)
on conflict (marker_id) do update set
  scopes=excluded.scopes,
  provider_key=excluded.provider_key,
  value_status=excluded.value_status,
  source_keys=excluded.source_keys,
  last_verified_at=excluded.last_verified_at,
  notes=excluded.notes,
  provider_kind=excluded.provider_kind,
  source_fields=excluded.source_fields,
  calculation_key=excluded.calculation_key,
  freshness_seconds=excluded.freshness_seconds,
  cache_policy=excluded.cache_policy,
  bulk_capable=excluded.bulk_capable;
