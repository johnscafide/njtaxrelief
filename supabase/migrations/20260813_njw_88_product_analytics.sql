-- NJW-88: privacy-minimized first-party product analytics
create table if not exists public.product_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  visitor_id uuid not null,
  session_id uuid not null,
  event_name text not null check (event_name in (
    'page_view','tool_open','marker_viewed','property_lookup_started','property_lookup_succeeded',
    'export_started','export_completed','upgrade_cta_clicked','checkout_started','subscription_confirmed'
  )),
  path text,
  tool text,
  referrer_host text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  properties jsonb not null default '{}'::jsonb
);
alter table public.product_events enable row level security;
revoke all on table public.product_events from anon, authenticated;
grant all on table public.product_events to service_role;
create index if not exists product_events_occurred_at_idx on public.product_events (occurred_at desc);
create index if not exists product_events_event_time_idx on public.product_events (event_name, occurred_at desc);
create index if not exists product_events_visitor_time_idx on public.product_events (visitor_id, occurred_at);
create index if not exists product_events_tool_time_idx on public.product_events (tool, occurred_at desc);

create or replace view public.analytics_daily_funnel with (security_invoker=true) as
select occurred_at::date as day,
 count(distinct visitor_id) filter (where event_name='page_view') as visitors,
 count(distinct visitor_id) filter (where event_name in ('tool_open','marker_viewed','property_lookup_succeeded','export_completed')) as activated_visitors,
 count(distinct visitor_id) filter (where event_name='upgrade_cta_clicked') as upgrade_intent,
 count(distinct visitor_id) filter (where event_name='checkout_started') as checkout_starts,
 count(distinct visitor_id) filter (where event_name='subscription_confirmed') as paid_conversions
from public.product_events group by 1 order by 1 desc;

create or replace view public.analytics_tool_usage_daily with (security_invoker=true) as
select occurred_at::date as day, coalesce(nullif(tool,''),'unknown') as tool, event_name,
 count(*) as events, count(distinct visitor_id) as visitors
from public.product_events
where event_name in ('tool_open','marker_viewed','property_lookup_started','property_lookup_succeeded','export_started','export_completed')
group by 1,2,3 order by 1 desc,4 desc;

create or replace view public.analytics_acquisition_daily with (security_invoker=true) as
select occurred_at::date as day,
 coalesce(nullif(utm_source,''),nullif(referrer_host,''),'direct') as source,
 coalesce(nullif(utm_medium,''),'none') as medium,
 coalesce(nullif(utm_campaign,''),'none') as campaign,
 count(distinct visitor_id) as visitors,
 count(distinct visitor_id) filter (where event_name in ('tool_open','marker_viewed','property_lookup_succeeded','export_completed')) as activated,
 count(distinct visitor_id) filter (where event_name='checkout_started') as checkout_starts
from public.product_events group by 1,2,3,4 order by 1 desc,5 desc;

create or replace view public.analytics_weekly_retention with (security_invoker=true) as
with first_seen as (
 select visitor_id, date_trunc('week',min(occurred_at))::date cohort_week
 from public.product_events group by visitor_id
), activity as (
 select distinct visitor_id,date_trunc('week',occurred_at)::date activity_week
 from public.product_events
 where event_name in ('tool_open','marker_viewed','property_lookup_succeeded','export_completed')
)
select f.cohort_week,
 ((a.activity_week-f.cohort_week)/7)::int as week_number,
 count(distinct a.visitor_id) as retained_visitors
from first_seen f join activity a using(visitor_id)
where a.activity_week>=f.cohort_week
group by 1,2 order by 1 desc,2;

revoke all on public.analytics_daily_funnel, public.analytics_tool_usage_daily, public.analytics_acquisition_daily, public.analytics_weekly_retention from anon, authenticated;
grant select on public.analytics_daily_funnel, public.analytics_tool_usage_daily, public.analytics_acquisition_daily, public.analytics_weekly_retention to service_role;
