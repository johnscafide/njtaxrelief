-- Manual service-only dispatcher for the aggregate Closing Review v5 structural shadow.
-- Reuses the existing Vault-backed closing shadow token. No cron is installed.

create or replace function private.intelligence_kick_closing_v5_shadow()
returns bigint
language plpgsql
security definer
set search_path = public, private, vault, net, pg_temp
as $$
declare
  v_enabled boolean;
  v_url text;
  v_token text;
  v_per_county integer;
  v_request_id bigint;
begin
  select enabled, project_url, per_county
    into v_enabled, v_url, v_per_county
  from public.intelligence_closing_shadow_control
  where id=true;

  if not coalesce(v_enabled,false) or v_url is null then
    return null;
  end if;

  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name='watchdog_closing_shadow_token'
  order by updated_at desc
  limit 1;

  if v_token is null then
    return null;
  end if;

  select net.http_post(
    url := rtrim(v_url,'/') || '/functions/v1/intelligence-closing-v5-structural-shadow',
    headers := jsonb_build_object('Content-Type','application/json','x-watchdog-shadow-token',v_token),
    body := jsonb_build_object('per_county',coalesce(v_per_county,3),'thresholds',jsonb_build_array(10,15,20,25,30,35,40,45,50)),
    timeout_milliseconds := 120000
  ) into v_request_id;

  return v_request_id;
end $$;

revoke all on function private.intelligence_kick_closing_v5_shadow() from public, anon, authenticated;
comment on function private.intelligence_kick_closing_v5_shadow() is
'Manual service-only dispatcher for aggregate Closing Review v5 structural shadow. No cron and no property-level persistence.';
