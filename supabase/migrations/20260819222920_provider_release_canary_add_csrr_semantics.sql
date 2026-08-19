create or replace function public.dispatch_provider_release_canary(p_scenario text)
returns bigint
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_raw text := encode(gen_random_bytes(48), 'hex');
  v_email text := 'watchdog-provider-canary-' || substr(v_raw,1,10) || '@example.com';
  v_request_id bigint;
begin
  if p_scenario not in ('zoning_v31','designation_stack_v15','csrr_v1','csrr_controls_v2','csrr_semantics_v3') then
    raise exception 'Unsupported release canary scenario';
  end if;

  insert into public.watchdog_test_bootstrap_tokens
    (token_hash, desired_email, redirect_to, expires_at, metadata)
  values
    (encode(digest(v_raw,'sha256'),'hex'),
     v_email,
     'https://njpropertytaxrelief.com/property/dashboard',
     now()+interval '10 minutes',
     jsonb_build_object('purpose','provider_release_canary','scenario',p_scenario,'no_real_spend',true));

  select net.http_post(
    url := 'https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/provider-release-canary',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object('token',v_raw,'scenario',p_scenario),
    timeout_milliseconds := 30000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.dispatch_provider_release_canary(text) from public, anon, authenticated;
grant execute on function public.dispatch_provider_release_canary(text) to service_role;
