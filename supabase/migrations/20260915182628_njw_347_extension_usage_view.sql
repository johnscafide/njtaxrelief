create or replace view public.analytics_extension_usage_daily
with (security_invoker = true)
as
select
  date_trunc('day', occurred_at)::date as day,
  count(*)::bigint as events,
  count(distinct user_id)::bigint as active_users,
  count(distinct session_id)::bigint as active_sessions,
  count(*) filter (where event_name='extension_opened')::bigint as opens,
  count(*) filter (where event_name='boldtrail_contact_detected')::bigint as contacts_detected,
  count(*) filter (where event_name='lookup_started')::bigint as lookups_started,
  count(*) filter (where event_name='lookup_succeeded')::bigint as lookups_succeeded,
  count(*) filter (where event_name='lookup_no_match')::bigint as lookups_no_match,
  count(*) filter (where event_name='lookup_ambiguous')::bigint as lookups_ambiguous,
  count(*) filter (where event_name='crm_write_started')::bigint as writes_started,
  count(*) filter (where event_name='crm_write_succeeded')::bigint as writes_succeeded,
  count(*) filter (where event_name='crm_write_failed')::bigint as writes_failed,
  coalesce(
    round(100.0 * count(*) filter (where event_name='crm_write_succeeded') /
      nullif(count(*) filter (where event_name='crm_write_started'),0),1),
    0
  )::numeric as write_success_pct
from public.watchdog_extension_events
group by 1;
