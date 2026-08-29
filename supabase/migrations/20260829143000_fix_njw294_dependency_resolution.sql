-- NJW-294: align staged deterministic formula metadata with the certified raw-provider dependency contract.
update public.derived_formula_registry
set engine_version='watchdog-derived-v24-njw294', updated_at=now()
where marker_id in ('watchdog.njplus.parcel_record_volatility','watchdog.njplus.housing_program_record_freshness','watchdog.njplus.pilot_revenue_concentration')
  and status='live';
