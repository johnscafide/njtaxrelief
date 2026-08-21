create or replace view public.analytics_product_timeseries
with (security_invoker = true) as
select 'hour'::text as grain,
       date_trunc('hour', occurred_at) as bucket,
       count(*)::bigint as events,
       count(distinct visitor_id)::bigint as visitors,
       count(distinct session_id)::bigint as sessions,
       count(*) filter (where event_name='page_view')::bigint as page_views,
       count(distinct visitor_id) filter (where event_name = any(array['tool_open','marker_viewed','property_lookup_succeeded','export_completed']))::bigint as activated_visitors,
       count(distinct visitor_id) filter (where event_name='upgrade_cta_clicked')::bigint as upgrade_intent,
       count(distinct visitor_id) filter (where event_name='checkout_started')::bigint as checkout_starts,
       count(distinct visitor_id) filter (where event_name='subscription_confirmed')::bigint as paid_conversions
from public.watchdog_product_events
group by 1,2
union all
select 'day'::text,
       date_trunc('day', occurred_at),
       count(*)::bigint,
       count(distinct visitor_id)::bigint,
       count(distinct session_id)::bigint,
       count(*) filter (where event_name='page_view')::bigint,
       count(distinct visitor_id) filter (where event_name = any(array['tool_open','marker_viewed','property_lookup_succeeded','export_completed']))::bigint,
       count(distinct visitor_id) filter (where event_name='upgrade_cta_clicked')::bigint,
       count(distinct visitor_id) filter (where event_name='checkout_started')::bigint,
       count(distinct visitor_id) filter (where event_name='subscription_confirmed')::bigint
from public.watchdog_product_events
group by 1,2
union all
select 'week'::text,
       date_trunc('week', occurred_at),
       count(*)::bigint,
       count(distinct visitor_id)::bigint,
       count(distinct session_id)::bigint,
       count(*) filter (where event_name='page_view')::bigint,
       count(distinct visitor_id) filter (where event_name = any(array['tool_open','marker_viewed','property_lookup_succeeded','export_completed']))::bigint,
       count(distinct visitor_id) filter (where event_name='upgrade_cta_clicked')::bigint,
       count(distinct visitor_id) filter (where event_name='checkout_started')::bigint,
       count(distinct visitor_id) filter (where event_name='subscription_confirmed')::bigint
from public.watchdog_product_events
group by 1,2
union all
select 'month'::text,
       date_trunc('month', occurred_at),
       count(*)::bigint,
       count(distinct visitor_id)::bigint,
       count(distinct session_id)::bigint,
       count(*) filter (where event_name='page_view')::bigint,
       count(distinct visitor_id) filter (where event_name = any(array['tool_open','marker_viewed','property_lookup_succeeded','export_completed']))::bigint,
       count(distinct visitor_id) filter (where event_name='upgrade_cta_clicked')::bigint,
       count(distinct visitor_id) filter (where event_name='checkout_started')::bigint,
       count(distinct visitor_id) filter (where event_name='subscription_confirmed')::bigint
from public.watchdog_product_events
group by 1,2;

revoke all on public.analytics_product_timeseries from public, anon, authenticated;
grant select on public.analytics_product_timeseries to service_role;

create or replace view public.analytics_user_growth_timeseries
with (security_invoker = true) as
select 'hour'::text as grain,
       date_trunc('hour', created_at) as bucket,
       count(*)::bigint as signups,
       count(*) filter (where coalesce(marketing_optin,false))::bigint as marketing_optins,
       count(*) filter (where coalesce(profile_complete,false))::bigint as completed_profiles
from public.profiles
group by 1,2
union all
select 'day'::text,
       date_trunc('day', created_at),
       count(*)::bigint,
       count(*) filter (where coalesce(marketing_optin,false))::bigint,
       count(*) filter (where coalesce(profile_complete,false))::bigint
from public.profiles
group by 1,2
union all
select 'week'::text,
       date_trunc('week', created_at),
       count(*)::bigint,
       count(*) filter (where coalesce(marketing_optin,false))::bigint,
       count(*) filter (where coalesce(profile_complete,false))::bigint
from public.profiles
group by 1,2
union all
select 'month'::text,
       date_trunc('month', created_at),
       count(*)::bigint,
       count(*) filter (where coalesce(marketing_optin,false))::bigint,
       count(*) filter (where coalesce(profile_complete,false))::bigint
from public.profiles
group by 1,2;

revoke all on public.analytics_user_growth_timeseries from public, anon, authenticated;
grant select on public.analytics_user_growth_timeseries to service_role;

create or replace function public.watchdog_analytics_snapshot(p_hours integer default 720)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
with params as (
  select greatest(1, least(coalesce(p_hours,720), 8760))::integer as hours
), bounds as (
  select hours, now() - make_interval(hours => hours) as cutoff from params
), filtered as materialized (
  select e.* from public.watchdog_product_events e, bounds b where e.occurred_at >= b.cutoff
), traffic as (
  select count(*)::bigint as events,
         count(distinct visitor_id)::bigint as visitors,
         count(distinct session_id)::bigint as sessions,
         count(*) filter (where event_name='page_view')::bigint as page_views,
         min(occurred_at) as first_event,
         max(occurred_at) as last_event
  from filtered
), funnel as (
  select count(distinct visitor_id) filter (where event_name='page_view')::bigint as reached,
         count(distinct visitor_id) filter (where event_name = any(array['tool_open','marker_viewed','property_lookup_succeeded','export_completed']))::bigint as activated,
         count(distinct visitor_id) filter (where event_name='upgrade_cta_clicked')::bigint as upgrade_intent,
         count(distinct visitor_id) filter (where event_name='checkout_started')::bigint as checkout_starts,
         count(distinct visitor_id) filter (where event_name='subscription_confirmed')::bigint as paid_conversions
  from filtered
), users as (
  select count(*)::bigint as registered_total,
         count(*) filter (where created_at >= b.cutoff)::bigint as new_registered,
         count(*) filter (where last_seen >= b.cutoff)::bigint as active_registered,
         count(*) filter (where coalesce(marketing_optin,false))::bigint as marketing_optins_total,
         count(*) filter (where coalesce(profile_complete,false))::bigint as completed_profiles_total
  from public.profiles cross join bounds b
), onboarding as (
  select count(*) filter (where completed_at is not null)::bigint as completed_total,
         count(*) filter (where completed_at >= b.cutoff)::bigint as completed_in_range
  from public.watchdog_onboarding_profiles cross join bounds b
), subscriptions as (
  select count(*) filter (where subscription_status in ('active','trialing','past_due','paused'))::bigint as active_total,
         count(*) filter (where cancel_at_period_end is true and subscription_status in ('active','trialing'))::bigint as canceling,
         count(*) filter (where subscription_status='trialing')::bigint as trials,
         count(*) filter (where subscription_status='past_due')::bigint as past_due,
         count(*) filter (where subscription_status in ('active','trialing','past_due','paused') and billing_interval is null)::bigint as interval_unknown
  from public.account_entitlements
), billing as (
  select count(*)::bigint as lifecycle_events
  from public.billing_provider_events, bounds b
  where occurred_at >= b.cutoff
)
select jsonb_build_object(
  'range_hours',(select hours from params),
  'traffic',(select to_jsonb(traffic) from traffic),
  'funnel',(select to_jsonb(funnel) from funnel),
  'users',(select to_jsonb(users) from users),
  'onboarding',(select to_jsonb(onboarding) from onboarding),
  'subscriptions',(select to_jsonb(subscriptions) from subscriptions),
  'billing',(select to_jsonb(billing) from billing),
  'top_pages',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
    select coalesce(nullif(path,''),'unknown') as path, count(*)::bigint events,
           count(distinct visitor_id)::bigint visitors, count(distinct session_id)::bigint sessions
    from filtered where event_name='page_view'
    group by 1 order by events desc limit 20
  ) x),
  'top_events',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
    select event_name, count(*)::bigint events, count(distinct visitor_id)::bigint visitors
    from filtered group by event_name order by events desc limit 20
  ) x),
  'top_tools',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
    select coalesce(nullif(tool,''),'unknown') as tool, count(*)::bigint events,
           count(distinct visitor_id)::bigint visitors
    from filtered
    where event_name = any(array['tool_open','marker_viewed','property_lookup_started','property_lookup_succeeded','export_started','export_completed'])
    group by 1 order by events desc limit 20
  ) x),
  'acquisition',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
    select coalesce(nullif(utm_source,''),nullif(referrer_host,''),'direct') as source,
           coalesce(nullif(utm_medium,''),'none') as medium,
           coalesce(nullif(utm_campaign,''),'none') as campaign,
           count(distinct visitor_id)::bigint visitors,
           count(distinct visitor_id) filter (where event_name = any(array['tool_open','marker_viewed','property_lookup_succeeded','export_completed']))::bigint as activated,
           count(distinct visitor_id) filter (where event_name='checkout_started')::bigint as checkout_starts
    from filtered group by 1,2,3 order by visitors desc limit 20
  ) x),
  'plan_breakdown',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
    select coalesce(plan_tier,'unknown') as plan_tier,
           coalesce(billing_tier,'none') as billing_tier,
           coalesce(billing_interval,'unknown') as billing_interval,
           coalesce(subscription_status,'unknown') as subscription_status,
           coalesce(provider,'unknown') as provider,
           count(*)::bigint accounts
    from public.account_entitlements
    group by 1,2,3,4,5 order by accounts desc
  ) x),
  'billing_events',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
    select event_type, provider, count(*)::bigint events
    from public.billing_provider_events, bounds b
    where occurred_at >= b.cutoff
    group by event_type, provider order by events desc limit 20
  ) x)
);
$$;

revoke all on function public.watchdog_analytics_snapshot(integer) from public, anon, authenticated;
grant execute on function public.watchdog_analytics_snapshot(integer) to service_role;
