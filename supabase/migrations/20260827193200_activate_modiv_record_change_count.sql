-- NJW-143: certify the exact MOD-IV longitudinal parcel-record change metric.
-- Authenticated release canary request 3801 passed before production promotion.

create or replace function public.dispatch_provider_release_canary(p_scenario text)
returns bigint
language plpgsql
set search_path to 'public','extensions'
as $function$
declare
  v_raw text := encode(gen_random_bytes(48), 'hex');
  v_email text := 'watchdog-provider-canary-' || substr(v_raw,1,10) || '@example.com';
  v_request_id bigint;
begin
  if p_scenario not in (
    'zoning_v31','designation_stack_v15','csrr_v1','csrr_controls_v2',
    'csrr_semantics_v3','geology_intersections_v1','model_bounds_v1',
    'uniformity_history_v1','uniformity_history_v2','uniformity_history_v3',
    'modiv_longitudinal_v1','modiv_longitudinal_partial_scan_v1',
    'modiv_longitudinal_missing_year_v1','community_assets_access_v1',
    'zoning_contact_status_v1','pilot_observed_v1','v036_sources_v1',
    'modiv_record_change_v1'
  ) then
    raise exception 'Unsupported release canary scenario';
  end if;
  insert into public.watchdog_test_bootstrap_tokens
    (token_hash, desired_email, redirect_to, expires_at, metadata)
  values
    (encode(digest(v_raw,'sha256'),'hex'),v_email,
     'https://njpropertytaxrelief.com/property/dashboard',now()+interval '10 minutes',
     jsonb_build_object('purpose','provider_release_canary','scenario',p_scenario,'no_real_spend',true));
  select net.http_post(
    url := 'https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/provider-release-canary',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object('token',v_raw,'scenario',p_scenario),
    timeout_milliseconds := 30000
  ) into v_request_id;
  return v_request_id;
end;
$function$;

insert into public.derived_formula_registry
  (marker_id,engine_version,formula,dependencies,confidence,status,explanation,updated_at,operation,config)
values
  ('njplus.nj-dca-modiv-longitudinal.parcel_record_change_count',
   'watchdog-modiv-record-change-v1',
   'Count consecutive observed annual MOD-IV transitions where any retained safe field changes across land value, improvement value, total value, property class, or exemption-code list; gaps in source years are never compared and zero is reported only when at least one consecutive transition was fully checked.',
   array['njplus.nj-dca-modiv-longitudinal.assessment_record_years','njplus.nj-dca-modiv-longitudinal.assessment_land_history','njplus.nj-dca-modiv-longitudinal.assessment_improvement_history','njplus.nj-dca-modiv-longitudinal.assessment_total_history','njplus.nj-dca-modiv-longitudinal.property_class_history','njplus.nj-dca-modiv-longitudinal.exemption_code_history']::text[],
   'high','live',
   'Deterministic record-transition count over the privacy-safe certified Treasury MOD-IV longitudinal release. Missing years are not interpreted as unchanged records.',
   now(),'history_metric',
   jsonb_build_object('require_consecutive_years',true,'minimum_compared_transitions',1,'change_unit','annual_transition','safe_fields',jsonb_build_array('land','improvement','total','class','exemptions')))
on conflict (marker_id) do update set
  engine_version=excluded.engine_version,formula=excluded.formula,dependencies=excluded.dependencies,
  confidence=excluded.confidence,status=excluded.status,explanation=excluded.explanation,
  updated_at=excluded.updated_at,operation=excluded.operation,config=excluded.config;

insert into public.data_center_provider_coverage
  (marker_id,scopes,provider_key,value_status,source_keys,last_verified_at,notes,
   provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable)
values
  ('njplus.nj-dca-modiv-longitudinal.parcel_record_change_count',array['property']::text[],
   'workbench-hydrate','live',array['nj-dca-modiv-longitudinal','treasury-modiv-2021-2026-v2']::text[],now(),
   'Authenticated production canary modiv_record_change_v1 passed on 0101_25.01_10: six certified annual records, five consecutive transitions, exact change count 0. Counts transitions with any change across retained land/improvement/total/class/exemption fields; missing years are skipped and insufficient consecutive evidence returns no value.',
   'derived_governed',
   array['records.years','records.land','records.improvement','records.total','records.class','records.exemptions']::text[],
   'watchdog-modiv-record-change-v1',21600,'refresh_on_demand',false)
on conflict (marker_id) do update set
  scopes=excluded.scopes,provider_key=excluded.provider_key,value_status=excluded.value_status,
  source_keys=excluded.source_keys,last_verified_at=excluded.last_verified_at,notes=excluded.notes,
  provider_kind=excluded.provider_kind,source_fields=excluded.source_fields,
  calculation_key=excluded.calculation_key,freshness_seconds=excluded.freshness_seconds,
  cache_policy=excluded.cache_policy,bulk_capable=excluded.bulk_capable;
