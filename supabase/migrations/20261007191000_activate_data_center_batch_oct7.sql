-- Turn on the 25 Data Center scores that passed production canary data_center_batch_oct7_v1
-- (watchdog_test_auth_events id 82, 2026-10-07 14:47:52Z, 8 pins in 8 counties), after the SR-1A
-- subject index was rebuilt: every value matched an independent recomputation from its inputs.
-- Not turned on: construction_scope_signal (value mismatch), fairness_score, comparable_depth_score,
-- market_anchor_confidence, consumer.sale_context_strength and appraiser.market_anchor_refresh (no pin returned a value).
insert into public.data_center_provider_coverage
(marker_id, scopes, provider_key, value_status, source_keys, last_verified_at, notes, provider_kind, source_fields, calculation_key, freshness_seconds, cache_policy, bulk_capable)
select v.marker_id, array[v.scope], 'watchdog-derived', 'live', array['watchdog-derived'], now(),
  coalesce(nullif(r.explanation, ''), 'Governed derived score.') || ' Canary event 82.',
  'derived_governed', r.dependencies, 'watchdog-derived-v24-njw294', 21600, 'refresh_on_demand', false
from (values
('watchdog.abatement_exposure', 'property'),
('watchdog.njplus.public_facility_proximity_signal', 'property'),
('watchdog.historic_property_constraint', 'property'),
('watchdog.reassessment_risk', 'property'),
('watchdog.tax_carry_advantage', 'property'),
('watchdog.njplus.new_build_delivery_momentum', 'county'),
('watchdog.njplus.site_marketing_context', 'property'),
('watchdog.water_protection_overlap', 'property'),
('watchdog.njplus.commercial_buildout_signal', 'municipality'),
('watchdog.fiscal_trend_momentum', 'property'),
('watchdog.exempt_pilot_exposure', 'property'),
('watchdog.njplus.amenity_access_profile', 'property'),
('watchdog.njplus.household_cost_context', 'municipality'),
('watchdog.njplus.new_build_price_pressure', 'county'),
('watchdog.collateral_operating_cost_stress', 'property'),
('watchdog.njplus.local_demand_context', 'municipality'),
('watchdog.njplus.housing_supply_balance', 'municipality'),
('watchdog.tax_trajectory', 'property'),
('watchdog.njplus.assessment_history_reliability', 'property'),
('watchdog.appeal_odds', 'property'),
('watchdog.njplus.new_build_market_depth', 'county'),
('watchdog.njplus.certificate_gap_priority', 'property'),
('watchdog.njplus.demolition_redevelopment_watch', 'municipality'),
('watchdog.environmental_site_proximity', 'property'),
('watchdog.permit_lifecycle_score', 'property')
) v(marker_id, scope)
join public.derived_formula_registry r on r.marker_id = v.marker_id and r.status = 'live'
on conflict (marker_id) do update set scopes=excluded.scopes, provider_key=excluded.provider_key, value_status=excluded.value_status, source_keys=excluded.source_keys, last_verified_at=excluded.last_verified_at, notes=excluded.notes, provider_kind=excluded.provider_kind, source_fields=excluded.source_fields, calculation_key=excluded.calculation_key, freshness_seconds=excluded.freshness_seconds, cache_policy=excluded.cache_policy, bulk_capable=excluded.bulk_capable;

-- PILOT roll-off watch passed canary municipal_context_oct7_v1 event 81 once the PILOT agreement data
-- was back in workbench-hydrate (#635); towns with no future reported end date correctly return no value.
insert into public.data_center_provider_coverage
(marker_id, scopes, provider_key, value_status, source_keys, last_verified_at, notes, provider_kind, source_fields, calculation_key, freshness_seconds, cache_policy, bulk_capable)
values
('watchdog.njplus.pilot_rolloff_watch', array['municipality'], 'workbench-derived', 'live', array['nj-dca-pilot-forecast','NJ DCA PILOT Database and Viewer 2026','nj-dca-user-friendly-budget'], now(), 'Higher when the next reported PILOT end date is close and PILOTs are a bigger share of the budget. Canary event 81.', 'derived_governed', array[]::text[], 'watchdog-derived-v24-njw294', 21600, 'refresh_on_demand', false)
on conflict (marker_id) do update set scopes=excluded.scopes, provider_key=excluded.provider_key, value_status=excluded.value_status, source_keys=excluded.source_keys, last_verified_at=excluded.last_verified_at, notes=excluded.notes, provider_kind=excluded.provider_kind, source_fields=excluded.source_fields, calculation_key=excluded.calculation_key, freshness_seconds=excluded.freshness_seconds, cache_policy=excluded.cache_policy, bulk_capable=excluded.bulk_capable;
