create or replace function public.watchdog_analytics_class_for_identity(p_identity uuid)
returns text
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_class text;
  v_role text;
begin
  select internal_class into v_class
  from public.analytics_internal_accounts
  where user_id = p_identity;

  if v_class is not null then
    return v_class;
  end if;

  select account_role into v_role
  from public.profiles
  where id = p_identity;

  if coalesce(v_role,'') = 'developer' then
    return 'internal_developer';
  end if;

  return 'external_account';
end;
$$;

revoke all on function public.watchdog_analytics_class_for_identity(uuid) from public, anon, authenticated;
grant execute on function public.watchdog_analytics_class_for_identity(uuid) to service_role;