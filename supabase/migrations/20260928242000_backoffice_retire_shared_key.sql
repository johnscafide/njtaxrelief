-- Retire the shared Backoffice key.
--
-- Backoffice sessions now come only from backoffice-dev-login, for signed-in
-- Watchdog accounts on public.backoffice_operators. The older shared-key path
-- stayed reachable: backoffice-recover lets any developer-role account set the
-- shared key, and backoffice-api `login` then issues a session (with an actor the
-- caller picks) to whoever knows it. Production has developer-role test accounts
-- that are not operators.
--
-- Close it where every caller meets: the key can no longer be stored, and a
-- candidate key never verifies. No shared key was stored on 2026-09-28; any that
-- appears later is removed here.

create or replace function public.backoffice_set_secret(p_name text, p_value text, p_description text default null)
returns void
language plpgsql
security definer
set search_path to 'public', 'vault', 'pg_temp'
as $function$
declare v_id uuid;
begin
  if p_name = 'backoffice_shared_access_key' then
    raise exception 'The shared Backoffice key is retired. Backoffice opens for Watchdog accounts on the access list.';
  end if;
  if p_name not in ('google_address_validation_api_key','backoffice_ingest_secret') then
    raise exception 'Secret name is not allowed';
  end if;
  if p_value is null or length(trim(p_value)) < 8 then
    raise exception 'Secret is too short';
  end if;
  select id into v_id from vault.decrypted_secrets where name = p_name order by created_at desc limit 1;
  if v_id is null then
    perform vault.create_secret(p_value, p_name, coalesce(p_description,'Watchdog Backoffice secret'), null);
  else
    perform vault.update_secret(v_id, p_value, p_name, coalesce(p_description,'Watchdog Backoffice secret'), null);
  end if;
end;
$function$;

create or replace function public.backoffice_verify_shared_key(p_candidate text)
returns boolean
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select false
$function$;

delete from vault.secrets where name = 'backoffice_shared_access_key';
