create or replace function public.watchdog_internal_analytics_user_ids()
returns uuid[]
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select coalesce(array_agg(user_id), array[]::uuid[])
  from public.analytics_internal_accounts;
$$;

revoke all on function public.watchdog_internal_analytics_user_ids() from public, anon, authenticated;
grant execute on function public.watchdog_internal_analytics_user_ids() to service_role;