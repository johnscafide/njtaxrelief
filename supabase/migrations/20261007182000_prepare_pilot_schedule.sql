-- PILOT forecast markers from the NJ DCA PILOT Database and Viewer 2026.
-- workbench-hydrate's PILOT schedule provider (pilot-schedule-provider.ts, data in
-- property/data/pilot-schedule.json) serves the four njplus.nj-dca-pilot-forecast forecast values and
-- watchdog.njplus.pilot_forecast_confidence. This migration stages the two derived PILOT scores.
-- Coverage rows stay as they are until the pilot_schedule_v1 canary passes in production.

insert into public.derived_formula_registry(marker_id,engine_version,formula,dependencies,confidence,status,explanation,operation,config,updated_at) values
('watchdog.internal.pilot_term_remaining_scaled_v1','watchdog-derived-pilot-schedule-2026-10-07','min(pilot_term_remaining / 60, 1) * 100',array['njplus.nj-dca-pilot-forecast.pilot_term_remaining']::text[],'high','live','Internal helper: months until the next reported PILOT end date, scaled to 0-100 with 60 months or more at 100.','weighted_signals',
  jsonb_build_object('signals', jsonb_build_array(jsonb_build_object('dep','njplus.nj-dca-pilot-forecast.pilot_term_remaining','weight',100,'transform','count60')))),now()),
('watchdog.njplus.pilot_rolloff_watch','watchdog-derived-pilot-schedule-2026-10-07','0.6 * (100 - scaled months to next PILOT end) + 0.4 * min(PILOT share of budget / 5%, 1) * 100',array['watchdog.internal.pilot_term_remaining_scaled_v1','njplus.nj-dca-pilot-forecast.pilot_municipal_share']::text[],'medium','live','Higher when a reported PILOT ends soon and PILOT money is a bigger part of the town budget. Uses reported end dates only.','weighted_scores',
  jsonb_build_object('items', jsonb_build_array(
    jsonb_build_object('dep','watchdog.internal.pilot_term_remaining_scaled_v1','weight',60,'transform','inverse_identity'),
    jsonb_build_object('dep','njplus.nj-dca-pilot-forecast.pilot_municipal_share','weight',40,'transform','count5')),
    'require_all', true),now()),
('watchdog.njplus.development_incentive_profile','watchdog-derived-pilot-schedule-2026-10-07','0.4 * min(agreements / 50, 1) + 0.3 * min(PILOT value share / 35%, 1) + 0.3 * min(PILOT share of budget / 5%, 1), scaled to 100',array['njplus.nj-dca-pilot-forecast.pilot_agreement_count','exemption.pilot_value_share','njplus.nj-dca-pilot-forecast.pilot_municipal_share']::text[],'medium','live','How much a town uses PILOTs: number of reported agreements, PILOT share of assessed value and PILOT share of the budget.','weighted_scores',
  jsonb_build_object('items', jsonb_build_array(
    jsonb_build_object('dep','njplus.nj-dca-pilot-forecast.pilot_agreement_count','weight',40,'transform','count50'),
    jsonb_build_object('dep','exemption.pilot_value_share','weight',30,'transform','share35'),
    jsonb_build_object('dep','njplus.nj-dca-pilot-forecast.pilot_municipal_share','weight',30,'transform','count5')),
    'require_all', false),now())
on conflict(marker_id) do update set engine_version=excluded.engine_version,formula=excluded.formula,dependencies=excluded.dependencies,confidence=excluded.confidence,status=excluded.status,explanation=excluded.explanation,operation=excluded.operation,config=excluded.config,updated_at=now();
