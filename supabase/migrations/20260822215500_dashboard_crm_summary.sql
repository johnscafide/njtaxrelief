-- Dashboard-only CRM summary. This keeps CRM integration tables behind their existing
-- RLS boundary and returns only the signed-in user's provider/count/sync summary.

create or replace function public.get_my_crm_dashboard_summary()
returns table(
  connected boolean,
  contact_count bigint,
  provider text,
  last_success_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select auth.uid() as user_id
  ),
  context_count as (
    select count(*)::bigint as n
    from public.integration_crm_context c
    join me on me.user_id is not null and c.user_id = me.user_id
  ),
  primary_connection as (
    select
      ipc.provider,
      ipc.last_success_at,
      coalesce(ipc.records_synced_total, 0)::bigint as records_synced_total
    from public.integration_provider_connections ipc
    join me on me.user_id is not null and ipc.user_id = me.user_id
    where ipc.sync_enabled = true
    order by ipc.last_success_at desc nulls last, ipc.updated_at desc
    limit 1
  )
  select
    (
      coalesce((select n from context_count), 0) > 0
      or coalesce((select records_synced_total from primary_connection), 0) > 0
      or (select last_success_at from primary_connection) is not null
    ) as connected,
    greatest(
      coalesce((select n from context_count), 0),
      coalesce((select records_synced_total from primary_connection), 0)
    )::bigint as contact_count,
    coalesce((select provider from primary_connection), '')::text as provider,
    (select last_success_at from primary_connection) as last_success_at;
$$;

revoke all on function public.get_my_crm_dashboard_summary() from public;
revoke all on function public.get_my_crm_dashboard_summary() from anon;
grant execute on function public.get_my_crm_dashboard_summary() to authenticated;
grant execute on function public.get_my_crm_dashboard_summary() to service_role;
