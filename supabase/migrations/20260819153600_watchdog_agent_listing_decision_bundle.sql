-- Watchdog agent/listing decision bundle.
-- Runtime prerequisite: workbench-derived-v9-agent-listing.
-- All formulas fail closed when required governed inputs are missing.

alter table public.derived_formula_registry
  drop constraint if exists derived_formula_registry_operation_check;

alter table public.derived_formula_registry
  add constraint derived_formula_registry_operation_check
  check (
    operation is null or operation = any (array[
      'year_delta','ratio','completeness','inverse','permit_closure','permit_activity',
      'weighted_signals','signal_count','signal_density','weighted_scores','max_scores',
      'tax_rate_position','municipal_cost_absorption','fiscal_resilience',
      'revaluation_pressure','transaction_tax_shock','investor_carry_volatility',
      'tax_reset_sensitivity','marketability_drag'
    ]::text[])
  );

insert into public.derived_formula_registry
(marker_id,engine_version,formula,dependencies,confidence,status,explanation,operation,config)
values
(
  'watchdog.buyer_objection_radar','watchdog-derived-v9-agent-listing',
  'Maximum of current municipal budget pressure, revaluation pressure, COD-based assessment unevenness, and county decided-appeal reduction rate',
  array['budget.pressure_score','watchdog.revaluation_risk','uniformity.coefficient','appeals.latest_win_rate_decided'],
  'high','live',
  'Buyer-conversation triage signal. The radar takes the strongest current governed risk component rather than averaging a material issue away. COD unevenness begins above 15 and reaches full pressure at 35. All four governed inputs are required; missing evidence returns dependency_missing.',
  'max_scores',
  '{"require_all":true,"items":[{"dep":"budget.pressure_score","transform":"identity"},{"dep":"watchdog.revaluation_risk","transform":"identity"},{"dep":"uniformity.coefficient","transform":"cod_risk"},{"dep":"appeals.latest_win_rate_decided","transform":"identity"}]}'::jsonb
),
(
  'watchdog.prelist_readiness_score','watchdog-derived-v9-agent-listing',
  '55% client public-record completeness + 25% verified SR-1A sale-sample depth + 20% inverse listing friction',
  array['watchdog.agent.client_brief_completeness','sales.sample_size','watchdog.listing_friction_index'],
  'high','live',
  'Pre-list readiness signal using the existing agent client-brief completeness score, NJ Division of Taxation SR-1A verified-sale sample depth, and inverse Listing Friction. Verified-sale depth reaches 100 at 150 usable arm’s-length sales, matching the established Watchdog evidence-depth scale. All inputs are required.',
  'weighted_scores',
  '{"require_all":true,"items":[{"dep":"watchdog.agent.client_brief_completeness","weight":0.55,"transform":"identity"},{"dep":"sales.sample_size","weight":0.25,"transform":"sample_depth150"},{"dep":"watchdog.listing_friction_index","weight":0.20,"transform":"inverse_identity"}]}'::jsonb
),
(
  'watchdog.offer_diligence_priority','watchdog-derived-v9-agent-listing',
  '55% listing friction + 25% missing client public-record completeness + 20% missing verified SR-1A sale-sample depth',
  array['watchdog.listing_friction_index','watchdog.agent.client_brief_completeness','sales.sample_size'],
  'high','live',
  'Pre-offer diligence priority signal. Higher values mean the property merits more public-record questions before an offer. Verified-sale depth reaches 100 at 150 usable arm’s-length SR-1A sales; missing-depth and missing-record components are explicit inverses. All inputs are required.',
  'weighted_scores',
  '{"require_all":true,"items":[{"dep":"watchdog.listing_friction_index","weight":0.55,"transform":"identity"},{"dep":"watchdog.agent.client_brief_completeness","weight":0.25,"transform":"inverse_identity"},{"dep":"sales.sample_size","weight":0.20,"transform":"inverse_sample_depth150"}]}'::jsonb
),
(
  'watchdog.verified_listing_story_strength','watchdog-derived-v9-agent-listing',
  '50% client public-record completeness + 35% verified SR-1A sale-sample depth + 15% COD-based assessment consistency',
  array['watchdog.agent.client_brief_completeness','sales.sample_size','uniformity.coefficient'],
  'high','live',
  'Strength of the sourced public-record narrative available for a listing conversation. Assessment consistency is the inverse of Watchdog COD pressure: COD at or below 15 scores fully consistent and COD 35 or above scores zero. Sale-sample depth reaches 100 at 150 verified SR-1A sales. All inputs are required.',
  'weighted_scores',
  '{"require_all":true,"items":[{"dep":"watchdog.agent.client_brief_completeness","weight":0.50,"transform":"identity"},{"dep":"sales.sample_size","weight":0.35,"transform":"sample_depth150"},{"dep":"uniformity.coefficient","weight":0.15,"transform":"cod_consistency"}]}'::jsonb
),
(
  'watchdog.marketability_drag_index','watchdog-derived-v9-agent-listing',
  '34% verified-market effective-tax burden + 23% municipal budget pressure + 23% revaluation pressure + 20% COD-based assessment unevenness',
  array['property.annual_tax','property.assessed_value','sales.ratio','sales.sample_size','budget.pressure_score','watchdog.revaluation_risk','uniformity.coefficient'],
  'high','live',
  'Listing-marketability tax and assessment context. Verified-market value is assessed value divided by the municipality SR-1A verified-sale assessment ratio; SR-1A requires at least 10 usable sales. Effective tax burden is normalized on the established Watchdog 1.2% best-to-3.6% worst market-value tax curve. This is a conversation-priority signal, not a prediction of saleability. Missing required evidence returns dependency_missing.',
  'marketability_drag',
  '{"tax_dep":"property.annual_tax","assessed_dep":"property.assessed_value","verified_ratio_dep":"sales.ratio","sample_size_dep":"sales.sample_size","pressure_dep":"budget.pressure_score","reval_dep":"watchdog.revaluation_risk","uniformity_dep":"uniformity.coefficient","burden_best":0.012,"burden_worst":0.036,"minimum_verified_sales":10}'::jsonb
)
on conflict(marker_id) do update set
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
(
  'watchdog.buyer_objection_radar',array['property','town'],'watchdog-derived','live',
  array['NJ DCA municipal budget and tax levy filings','NJ Division of Taxation 2026 Chapter 123','NJ Division of Taxation assessment uniformity','NJ Division of Taxation property-tax appeal outcomes'],now(),
  'Governed buyer-conversation triage signal using the maximum current risk component. All four inputs are required and missing evidence returns dependency_missing.',
  'derived_governed',array['budget.pressure_score','watchdog.revaluation_risk','uniformity.coefficient','appeals.latest_win_rate_decided'],'watchdog-derived-v9-agent-listing',21600,'refresh_on_demand',true
),
(
  'watchdog.prelist_readiness_score',array['property'],'watchdog-derived','live',
  array['NJOGIS Parcels / MOD-IV Composite','NJ Division of Taxation SR-1A verified sales','Watchdog governed listing-friction formula'],now(),
  'Governed pre-list readiness score. SR-1A sample depth uses the established 150-sale full-scale reference. Missing required evidence returns dependency_missing.',
  'derived_governed',array['watchdog.agent.client_brief_completeness','sales.sample_size','watchdog.listing_friction_index'],'watchdog-derived-v9-agent-listing',21600,'refresh_on_demand',true
),
(
  'watchdog.offer_diligence_priority',array['property'],'watchdog-derived','live',
  array['NJOGIS Parcels / MOD-IV Composite','NJ Division of Taxation SR-1A verified sales','Watchdog governed listing-friction formula'],now(),
  'Governed pre-offer diligence priority score using listing friction and explicit evidence gaps. Missing required evidence returns dependency_missing.',
  'derived_governed',array['watchdog.listing_friction_index','watchdog.agent.client_brief_completeness','sales.sample_size'],'watchdog-derived-v9-agent-listing',21600,'refresh_on_demand',true
),
(
  'watchdog.verified_listing_story_strength',array['property'],'watchdog-derived','live',
  array['NJOGIS Parcels / MOD-IV Composite','NJ Division of Taxation SR-1A verified sales','NJ Division of Taxation assessment uniformity'],now(),
  'Governed listing-story evidence strength score using public-record completeness, verified-sale sample depth, and deterministic COD consistency. Missing required evidence returns dependency_missing.',
  'derived_governed',array['watchdog.agent.client_brief_completeness','sales.sample_size','uniformity.coefficient'],'watchdog-derived-v9-agent-listing',21600,'refresh_on_demand',true
),
(
  'watchdog.marketability_drag_index',array['property','town'],'watchdog-derived','live',
  array['NJOGIS Parcels / MOD-IV Composite','NJ Division of Taxation SR-1A verified sales','NJ DCA municipal budget and tax levy filings','NJ Division of Taxation 2026 Chapter 123','NJ Division of Taxation assessment uniformity'],now(),
  'Governed marketability conversation-priority signal. Tax burden is based on SR-1A-implied verified market value and the established 1.2%-3.6% Watchdog burden curve; at least 10 verified sales are required.',
  'derived_governed',array['property.annual_tax','property.assessed_value','sales.ratio','sales.sample_size','budget.pressure_score','watchdog.revaluation_risk','uniformity.coefficient'],'watchdog-derived-v9-agent-listing',21600,'refresh_on_demand',true
)
on conflict(marker_id) do update set
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