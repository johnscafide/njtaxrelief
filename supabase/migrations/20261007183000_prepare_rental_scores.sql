-- Rental and affordability scores for the Data Center.
-- Inputs: the live NJ DCA housing markers, plus workbench-hydrate's new ACS rental provider
-- (acs-rental-provider.ts, property/data/acs-rental-2024.json) and the federal housing context provider
-- written in #303 (HUD subsidized units). Eviction rate has no current town-level public source, so
-- rental market pressure uses rental vacancy, rent burden and long-run rent growth instead.
-- Coverage rows stay as they are until the municipal_context_oct7_v1 canary passes in production.

insert into public.derived_formula_registry(marker_id,engine_version,formula,dependencies,confidence,status,explanation,operation,config,updated_at) values
('watchdog.internal.acs_rental_vacancy_scaled_v1','watchdog-derived-rental-2026-10-07','min(rental vacancy rate / 8, 1) * 100',array['watchdog.internal.acs_rental_vacancy_rate_v1']::text[],'high','live','Internal helper: ACS rental vacancy rate scaled to 0-100 with 8% or more at 100.','weighted_signals',
  jsonb_build_object('signals', jsonb_build_array(jsonb_build_object('dep','watchdog.internal.acs_rental_vacancy_rate_v1','weight',100,'transform','count8')))),now()),
('watchdog.njplus.rental_market_pressure','watchdog-derived-rental-2026-10-07','0.4 * (100 - scaled rental vacancy) + 0.35 * rent burden share + 0.25 * min(rent change since 2000 / 150%, 1) * 100',array['watchdog.internal.acs_rental_vacancy_scaled_v1','watchdog.internal.acs_rent_burden_share_v1','njplus.nj-dca-neighborhood-trends.rental_cost_change']::text[],'medium','live','Higher when few rentals are vacant, more renters pay 30% or more of income on rent, and rents have climbed faster since 2000.','weighted_scores',
  jsonb_build_object('items', jsonb_build_array(
    jsonb_build_object('dep','watchdog.internal.acs_rental_vacancy_scaled_v1','weight',40,'transform','inverse_identity'),
    jsonb_build_object('dep','watchdog.internal.acs_rent_burden_share_v1','weight',35,'transform','identity'),
    jsonb_build_object('dep','njplus.nj-dca-neighborhood-trends.rental_cost_change','weight',25,'transform','count150')),
    'require_all', true),now()),
('watchdog.internal.rent_to_income_v1','watchdog-derived-rental-2026-10-07','median gross rent * 12 / median household income * 100',array['njplus.nj-dca-municipal-housing-profile.median_gross_rent','njplus.nj-dca-neighborhood-trends.household_income']::text[],'high','live','Internal helper: a year of median rent as a percent of median household income.','ratio',
  jsonb_build_object('num','njplus.nj-dca-municipal-housing-profile.median_gross_rent','den','njplus.nj-dca-neighborhood-trends.household_income','scale',1200,'den_min',1,'precision',2),now()),
('watchdog.njplus.housing_affordability_gap','watchdog-derived-rental-2026-10-07','0.5 * cost-burdened household share + 0.5 * min(rent to income / 50%, 1) * 100',array['njplus.nj-dca-municipal-housing-profile.housing_cost_burden_share','watchdog.internal.rent_to_income_v1']::text[],'medium','live','Higher when more households are cost burdened and a year of median rent takes a bigger share of median income.','weighted_scores',
  jsonb_build_object('items', jsonb_build_array(
    jsonb_build_object('dep','njplus.nj-dca-municipal-housing-profile.housing_cost_burden_share','weight',50,'transform','identity'),
    jsonb_build_object('dep','watchdog.internal.rent_to_income_v1','weight',50,'transform','count50')),
    'require_all', true),now()),
('watchdog.internal.hud_units_per_renter_v1','watchdog-derived-rental-2026-10-07','HUD subsidized units / renter households * 100',array['njplus.nj-dca-affordable-housing.hud_subsidized_units','watchdog.internal.acs_renter_households_v1']::text[],'high','live','Internal helper: HUD project-based subsidized units per 100 renter households.','ratio',
  jsonb_build_object('num','njplus.nj-dca-affordable-housing.hud_subsidized_units','den','watchdog.internal.acs_renter_households_v1','scale',100,'den_min',1,'precision',2),now()),
('watchdog.internal.affordable_rental_per_renter_v1','watchdog-derived-rental-2026-10-07','DCA affordable rental units / renter households * 100',array['njplus.nj-dca-affordable-housing.affordable_units_rental','watchdog.internal.acs_renter_households_v1']::text[],'high','live','Internal helper: DCA-reported affordable rental units per 100 renter households.','ratio',
  jsonb_build_object('num','njplus.nj-dca-affordable-housing.affordable_units_rental','den','watchdog.internal.acs_renter_households_v1','scale',100,'den_min',1,'precision',2),now()),
('watchdog.njplus.rent_support_context','watchdog-derived-rental-2026-10-07','0.5 * min(HUD units per 100 renters / 30, 1) + 0.5 * min(affordable rentals per 100 renters / 30, 1), scaled to 100',array['watchdog.internal.hud_units_per_renter_v1','watchdog.internal.affordable_rental_per_renter_v1']::text[],'medium','live','How much subsidized and affordable rental housing a town has for its number of renters.','weighted_scores',
  jsonb_build_object('items', jsonb_build_array(
    jsonb_build_object('dep','watchdog.internal.hud_units_per_renter_v1','weight',50,'transform','count30'),
    jsonb_build_object('dep','watchdog.internal.affordable_rental_per_renter_v1','weight',50,'transform','count30')),
    'require_all', false),now())
on conflict(marker_id) do update set engine_version=excluded.engine_version,formula=excluded.formula,dependencies=excluded.dependencies,confidence=excluded.confidence,status=excluded.status,explanation=excluded.explanation,operation=excluded.operation,config=excluded.config,updated_at=now();
