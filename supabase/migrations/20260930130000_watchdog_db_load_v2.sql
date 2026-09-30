-- Load check v2 for long batch jobs (statewide parcel sync, Watchdog Score
-- precompute). Read only, service role only.
--
-- v1 only reported active client queries and the longest one. On Sep 30 the
-- instance ran out of IO while every batch query was being cancelled at the
-- 8 s statement timeout, so neither signal ever crossed the jobs' thresholds.
-- v2 adds the queries waiting on IO and on locks. The jobs also time this call
-- itself (property/scripts/db_brake.py): a slow answer means a starved server,
-- and no answer counts as busy.
create or replace function public.watchdog_db_load()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'active', count(*),
    'longest_seconds', coalesce(extract(epoch from max(now() - query_start)), 0),
    'io_waiting', count(*) filter (where wait_event_type = 'IO'),
    'lock_waiting', count(*) filter (where wait_event_type = 'Lock')
  )
  from pg_stat_activity
  where state = 'active' and pid <> pg_backend_pid() and backend_type = 'client backend';
$$;

revoke all on function public.watchdog_db_load() from public, anon, authenticated;
grant execute on function public.watchdog_db_load() to service_role;
