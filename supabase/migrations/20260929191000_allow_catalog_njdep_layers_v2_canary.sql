-- Allow the catalog_njdep_layers_v2 provider release canary scenario.
--
-- The body below is the live production definition read with
-- pg_get_functiondef('public.dispatch_provider_release_canary(text)'::regprocedure)
-- on 2026-09-29, after 20260929180000 was applied (md5 of that definition:
-- d674d60bb458f26e5bef07171831e5f7). The only change is 'catalog_njdep_layers_v2' appended to the
-- scenario allowlist. The function stays SECURITY INVOKER, owned by postgres, and executable only
-- by postgres and service_role, which is the live ACL.
--
-- catalog_njdep_layers_v2 reruns the NJDEP catalog canary after the workbench-hydrate attribute-map
-- deploy. It requires provider-release-canary to route the scenario (production-v045-bootstrap.ts).

CREATE OR REPLACE FUNCTION public.dispatch_provider_release_canary(p_scenario text)
 RETURNS bigint
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_raw text := encode(gen_random_bytes(48), 'hex'); v_email text := 'watchdog-provider-canary-' || substr(v_raw,1,10) || '@example.com'; v_request_id bigint;
begin
 if p_scenario not in ('zoning_v31','designation_stack_v15','csrr_v1','csrr_controls_v2','csrr_semantics_v3','geology_intersections_v1','model_bounds_v1','uniformity_history_v1','uniformity_history_v2','uniformity_history_v3','modiv_longitudinal_v1','modiv_longitudinal_partial_scan_v1','modiv_longitudinal_missing_year_v1','community_assets_access_v1','zoning_contact_status_v1','pilot_observed_v1','v036_sources_v1','modiv_record_change_v1','affordable_housing_v037','development_trends_v038','ufb_v039','ufb_longitudinal_v040','njw294_deterministic_v1','catalog_njdep_layers_v1','catalog_njdep_layers_v2') then raise exception 'Unsupported release canary scenario'; end if;
 insert into public.watchdog_test_bootstrap_tokens(token_hash,desired_email,redirect_to,expires_at,metadata) values (encode(digest(v_raw,'sha256'),'hex'),v_email,'https://njpropertytaxrelief.com/property/dashboard',now()+interval '10 minutes',jsonb_build_object('purpose','provider_release_canary','scenario',p_scenario,'no_real_spend',true));
 select net.http_post(url := 'https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/provider-release-canary',headers := jsonb_build_object('Content-Type','application/json'),body := jsonb_build_object('token',v_raw,'scenario',p_scenario),timeout_milliseconds := 30000) into v_request_id; return v_request_id;
end; $function$;

revoke all on function public.dispatch_provider_release_canary(text) from public, anon, authenticated;
grant execute on function public.dispatch_provider_release_canary(text) to service_role;
