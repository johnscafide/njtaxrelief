-- Read-only load check for long batch jobs (Watchdog Score precompute).
-- The job waits while the database is busy instead of adding to the load:
-- the same rule the mailing ZIP purge used (more than 10 active queries, or
-- any query running longer than 15 seconds). Service role only.
create or replace function public.watchdog_db_load()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'active', count(*),
    'longest_seconds', coalesce(extract(epoch from max(now() - query_start)), 0)
  )
  from pg_stat_activity
  where state = 'active' and pid <> pg_backend_pid() and backend_type = 'client backend';
$$;

revoke all on function public.watchdog_db_load() from public, anon, authenticated;
grant execute on function public.watchdog_db_load() to service_role;
