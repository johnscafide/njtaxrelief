create or replace function public.dispatch_investor_screen_alias_canary()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_raw text := encode(gen_random_bytes(48), 'hex');
  v_email text := 'watchdog-investor-screen-canary-' || substr(v_raw,1,10) || '@example.com';
  v_request_id bigint;
begin
  insert into public.watchdog_test_bootstrap_tokens
    (token_hash, desired_email, redirect_to, expires_at, metadata)
  values
    (encode(digest(v_raw,'sha256'),'hex'),
     v_email,
     'https://watchdogindex.com/property/dashboard',
     now()+interval '10 minutes',
     jsonb_build_object('purpose','provider_release_canary','scenario','investor_screen_alias_v1','no_real_spend',true));

  select net.http_post(
    url := 'https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/provider-release-canary',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object('token',v_raw,'scenario','investor_screen_alias_v1'),
    timeout_milliseconds := 30000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.dispatch_investor_screen_alias_canary() from public;
grant execute on function public.dispatch_investor_screen_alias_canary() to service_role;
