-- Privacy-preserving live presence aggregate for authenticated Watchdog dashboards.
-- Returns counts only; no visitor/session identifiers are exposed.
create or replace function public.get_watchdog_live_presence()
returns table (
  active_sessions bigint,
  active_visitors bigint,
  window_minutes integer,
  as_of timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(distinct session_id)::bigint as active_sessions,
    count(distinct visitor_id)::bigint as active_visitors,
    5::integer as window_minutes,
    now() as as_of
  from public.watchdog_product_events
  where occurred_at >= now() - interval '5 minutes'
    and coalesce(audience_class, '') <> 'internal';
$$;

revoke all on function public.get_watchdog_live_presence() from public;
grant execute on function public.get_watchdog_live_presence() to authenticated;

comment on function public.get_watchdog_live_presence() is
'Privacy-preserving aggregate live-presence signal for authenticated Watchdog dashboards. Returns counts only; never identities.';
