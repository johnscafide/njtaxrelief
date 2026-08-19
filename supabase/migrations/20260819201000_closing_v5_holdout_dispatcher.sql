-- Manual service-only dispatcher for the one-shot Closing Review v5 fresh holdout seeder.
-- The caller supplies the calibration-set UUID; the Vault token never leaves the database.
-- No cron is installed.

create or replace function private.intelligence_kick_closing_v5_holdout(p_set_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public, private, vault, net, pg_temp
as $$
declare
  v_enabled boolean;
  v_url text;
  v_token text;
  v_request_id bigint;
begin
  select enabled, project_url
    into v_enabled, v_url
  from public.intelligence_closing_shadow_control
  where id=true;

  if not coalesce(v_enabled,false) or v_url is null or p_set_id is null then
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
    url := rtrim(v_url,'/') || '/functions/v1/intelligence-closing-v5-holdout-seed',
    headers := jsonb_build_object('Content-Type','application/json','x-watchdog-shadow-token',v_token),
    body := jsonb_build_object('calibration_set_id',p_set_id::text),
    timeout_milliseconds := 120000
  ) into v_request_id;

  return v_request_id;
end $$;

revoke all on function private.intelligence_kick_closing_v5_holdout(uuid) from public, anon, authenticated;
comment on function private.intelligence_kick_closing_v5_holdout(uuid) is
'Manual service-only dispatcher for the one-shot Closing Review v5 fresh holdout seeder. No cron; Vault token remains server-side.';
