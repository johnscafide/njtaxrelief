alter table public.watchdog_product_events
  add column if not exists audience_class text not null default 'external_visitor',
  add column if not exists referrer_url text,
  add column if not exists landing_path text,
  add column if not exists session_referrer_host text,
  add column if not exists session_referrer_url text,
  add column if not exists session_landing_path text,
  add column if not exists session_utm_source text,
  add column if not exists session_utm_medium text,
  add column if not exists session_utm_campaign text,
  add column if not exists session_utm_content text,
  add column if not exists session_utm_term text,
  add column if not exists click_source text;

alter table public.watchdog_product_events drop constraint if exists watchdog_product_events_audience_class_check;
alter table public.watchdog_product_events add constraint watchdog_product_events_audience_class_check check (audience_class in (
  'external_visitor','external_account','internal_owner','internal_agent','internal_developer','internal_test'
));

create table if not exists public.analytics_internal_accounts (
  user_id uuid primary key,
  internal_class text not null check (internal_class in ('internal_owner','internal_agent','internal_developer','internal_test')),
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.analytics_internal_accounts enable row level security;
revoke all on table public.analytics_internal_accounts from public, anon, authenticated;
grant all on table public.analytics_internal_accounts to service_role;

insert into public.analytics_internal_accounts(user_id,internal_class,source,updated_at)
select p.id,
       case
         when lower(trim(coalesce(p.full_name,p.display_name,'')))='john scafide' then 'internal_owner'
         when lower(trim(coalesce(p.full_name,p.display_name,'')))='heather nicole' then 'internal_agent'
         when lower(trim(coalesce(p.full_name,p.display_name,''))) like 'watchdog e2e sandbox%' then 'internal_test'
         when coalesce(p.account_role,'')='developer' then 'internal_developer'
         else 'internal_agent'
       end,
       'watchdog_internal_seed',
       now()
from public.profiles p
where coalesce(p.account_role,'')='developer'
   or lower(trim(coalesce(p.full_name,p.display_name,''))) in ('john scafide','heather nicole')
   or lower(trim(coalesce(p.full_name,p.display_name,''))) like 'watchdog e2e sandbox%'
on conflict (user_id) do update set internal_class=excluded.internal_class,source=excluded.source,updated_at=excluded.updated_at;

create table if not exists public.analytics_visitor_classes (
  visitor_id uuid primary key,
  audience_class text not null check (audience_class in ('external_visitor','external_account','internal_owner','internal_agent','internal_developer','internal_test')),
  classified_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.analytics_visitor_classes enable row level security;
revoke all on table public.analytics_visitor_classes from public, anon, authenticated;
grant all on table public.analytics_visitor_classes to service_role;

create index if not exists watchdog_product_events_audience_time_idx on public.watchdog_product_events (audience_class, occurred_at desc);
create index if not exists watchdog_product_events_session_source_idx on public.watchdog_product_events (session_referrer_host, session_utm_source, occurred_at desc);

create or replace view public.analytics_daily_funnel with (security_invoker=true) as
select occurred_at::date as day,
  count(distinct visitor_id) filter (where event_name='page_view') as visitors,
  count(distinct visitor_id) filter (where event_name in ('tool_open','marker_viewed','property_lookup_succeeded','export_completed')) as activated_visitors,
  count(distinct visitor_id) filter (where event_name='upgrade_cta_clicked') as upgrade_intent,
  count(distinct visitor_id) filter (where event_name='checkout_started') as checkout_starts,
  count(distinct visitor_id) filter (where event_name='subscription_confirmed') as paid_conversions
from public.watchdog_product_events where audience_class in ('external_visitor','external_account') group by 1 order by 1 desc;

create or replace view public.analytics_tool_usage_daily with (security_invoker=true) as
select occurred_at::date as day,coalesce(nullif(tool,''),'unknown') as tool,event_name,count(*) as events,count(distinct visitor_id) as visitors
from public.watchdog_product_events
where audience_class in ('external_visitor','external_account') and event_name in ('tool_open','marker_viewed','property_lookup_started','property_lookup_succeeded','export_started','export_completed')
group by 1,2,3 order by 1 desc,4 desc;

create or replace view public.analytics_acquisition_daily with (security_invoker=true) as
select occurred_at::date as day,
  coalesce(nullif(session_utm_source,''),nullif(utm_source,''),nullif(session_referrer_host,''),nullif(referrer_host,''),'direct') as source,
  coalesce(nullif(session_utm_medium,''),nullif(utm_medium,''),case when nullif(click_source,'') is not null then 'paid' end,'none') as medium,
  coalesce(nullif(session_utm_campaign,''),nullif(utm_campaign,''),'none') as campaign,
  count(distinct visitor_id) as visitors,
  count(distinct visitor_id) filter (where event_name in ('tool_open','marker_viewed','property_lookup_succeeded','export_completed')) as activated,
  count(distinct visitor_id) filter (where event_name='checkout_started') as checkout_starts
from public.watchdog_product_events where audience_class in ('external_visitor','external_account') group by 1,2,3,4 order by 1 desc,5 desc;

create or replace view public.analytics_weekly_retention with (security_invoker=true) as
with first_seen as (
  select visitor_id,date_trunc('week',min(occurred_at))::date as cohort_week
  from public.watchdog_product_events where audience_class in ('external_visitor','external_account') group by visitor_id
), activity as (
  select distinct visitor_id,date_trunc('week',occurred_at)::date as activity_week
  from public.watchdog_product_events
  where audience_class in ('external_visitor','external_account') and event_name in ('tool_open','marker_viewed','property_lookup_succeeded','export_completed')
)
select f.cohort_week,((a.activity_week-f.cohort_week)/7)::int as week_number,count(distinct a.visitor_id) as retained_visitors
from first_seen f join activity a using(visitor_id) where a.activity_week>=f.cohort_week group by 1,2 order by 1 desc,2;

create or replace view public.analytics_intelligence_funnel_daily with (security_invoker=true) as
select occurred_at::date as day,
  count(distinct visitor_id) filter (where event_name='intelligence_exposed') as intelligence_reached,
  count(distinct visitor_id) filter (where event_name='intelligence_reasoning_inspected') as reasoning_inspectors,
  count(distinct visitor_id) filter (where event_name='intelligence_action_started') as action_starters,
  count(distinct visitor_id) filter (where event_name='intelligence_action_completed') as action_completers,
  count(distinct visitor_id) filter (where event_name='intent_question_shown') as intent_question_viewers,
  count(distinct visitor_id) filter (where event_name='intent_question_answered') as intent_question_answerers,
  count(distinct visitor_id) filter (where event_name in ('today_item_reviewed','today_item_snoozed','today_item_dismissed','today_item_reopened')) as today_triagers,
  count(distinct visitor_id) filter (where event_name='trust_evidence_opened') as trust_evidence_openers,
  count(*) filter (where event_name='intelligence_exposed') as intelligence_exposures,
  count(*) filter (where event_name='intelligence_reasoning_inspected') as reasoning_inspections,
  count(*) filter (where event_name='intelligence_action_completed') as completed_actions
from public.watchdog_product_events
where audience_class in ('external_visitor','external_account') and event_name in ('intelligence_exposed','intelligence_reasoning_inspected','intelligence_action_started','intelligence_action_completed','intent_question_shown','intent_question_answered','intent_question_skipped','today_item_reviewed','today_item_snoozed','today_item_dismissed','today_item_reopened','trust_evidence_opened')
group by 1 order by 1 desc;

create or replace view public.analytics_intelligence_interactions_daily with (security_invoker=true) as
select occurred_at::date as day,event_name,coalesce(nullif(properties->>'surface',''),nullif(tool,''),'unknown') as surface,
  coalesce(nullif(properties->>'action',''),'none') as action,coalesce(nullif(properties->>'status',''),'none') as status,
  count(*) as events,count(distinct visitor_id) as visitors,count(distinct session_id) as sessions
from public.watchdog_product_events
where audience_class in ('external_visitor','external_account') and event_name in ('intelligence_exposed','intelligence_reasoning_inspected','intelligence_action_started','intelligence_action_completed','intent_question_shown','intent_question_answered','intent_question_skipped','today_item_reviewed','today_item_snoozed','today_item_dismissed','today_item_reopened','trust_evidence_opened')
group by 1,2,3,4,5 order by 1 desc,6 desc;

create or replace view public.analytics_product_timeseries with (security_invoker=true) as
select 'hour'::text as grain,date_trunc('hour',occurred_at) as bucket,count(*)::bigint as events,count(distinct visitor_id)::bigint as visitors,count(distinct session_id)::bigint as sessions,count(*) filter (where event_name='page_view')::bigint as page_views,count(distinct visitor_id) filter (where event_name=any(array['tool_open','marker_viewed','property_lookup_succeeded','export_completed']))::bigint as activated_visitors,count(distinct visitor_id) filter (where event_name='upgrade_cta_clicked')::bigint as upgrade_intent,count(distinct visitor_id) filter (where event_name='checkout_started')::bigint as checkout_starts,count(distinct visitor_id) filter (where event_name='subscription_confirmed')::bigint as paid_conversions from public.watchdog_product_events where audience_class in ('external_visitor','external_account') group by 1,2
union all select 'day'::text,date_trunc('day',occurred_at),count(*)::bigint,count(distinct visitor_id)::bigint,count(distinct session_id)::bigint,count(*) filter (where event_name='page_view')::bigint,count(distinct visitor_id) filter (where event_name=any(array['tool_open','marker_viewed','property_lookup_succeeded','export_completed']))::bigint,count(distinct visitor_id) filter (where event_name='upgrade_cta_clicked')::bigint,count(distinct visitor_id) filter (where event_name='checkout_started')::bigint,count(distinct visitor_id) filter (where event_name='subscription_confirmed')::bigint from public.watchdog_product_events where audience_class in ('external_visitor','external_account') group by 1,2
union all select 'week'::text,date_trunc('week',occurred_at),count(*)::bigint,count(distinct visitor_id)::bigint,count(distinct session_id)::bigint,count(*) filter (where event_name='page_view')::bigint,count(distinct visitor_id) filter (where event_name=any(array['tool_open','marker_viewed','property_lookup_succeeded','export_completed']))::bigint,count(distinct visitor_id) filter (where event_name='upgrade_cta_clicked')::bigint,count(distinct visitor_id) filter (where event_name='checkout_started')::bigint,count(distinct visitor_id) filter (where event_name='subscription_confirmed')::bigint from public.watchdog_product_events where audience_class in ('external_visitor','external_account') group by 1,2
union all select 'month'::text,date_trunc('month',occurred_at),count(*)::bigint,count(distinct visitor_id)::bigint,count(distinct session_id)::bigint,count(*) filter (where event_name='page_view')::bigint,count(distinct visitor_id) filter (where event_name=any(array['tool_open','marker_viewed','property_lookup_succeeded','export_completed']))::bigint,count(distinct visitor_id) filter (where event_name='upgrade_cta_clicked')::bigint,count(distinct visitor_id) filter (where event_name='checkout_started')::bigint,count(distinct visitor_id) filter (where event_name='subscription_confirmed')::bigint from public.watchdog_product_events where audience_class in ('external_visitor','external_account') group by 1,2;

create or replace view public.analytics_user_growth_timeseries with (security_invoker=true) as
select 'hour'::text as grain,date_trunc('hour',p.created_at) as bucket,count(*)::bigint as signups,count(*) filter (where coalesce(p.marketing_optin,false))::bigint as marketing_optins,count(*) filter (where coalesce(p.profile_complete,false))::bigint as completed_profiles from public.profiles p where coalesce(p.account_role,'')<>'developer' and not exists(select 1 from public.analytics_internal_accounts ia where ia.user_id=p.id) group by 1,2
union all select 'day'::text,date_trunc('day',p.created_at),count(*)::bigint,count(*) filter (where coalesce(p.marketing_optin,false))::bigint,count(*) filter (where coalesce(p.profile_complete,false))::bigint from public.profiles p where coalesce(p.account_role,'')<>'developer' and not exists(select 1 from public.analytics_internal_accounts ia where ia.user_id=p.id) group by 1,2
union all select 'week'::text,date_trunc('week',p.created_at),count(*)::bigint,count(*) filter (where coalesce(p.marketing_optin,false))::bigint,count(*) filter (where coalesce(p.profile_complete,false))::bigint from public.profiles p where coalesce(p.account_role,'')<>'developer' and not exists(select 1 from public.analytics_internal_accounts ia where ia.user_id=p.id) group by 1,2
union all select 'month'::text,date_trunc('month',p.created_at),count(*)::bigint,count(*) filter (where coalesce(p.marketing_optin,false))::bigint,count(*) filter (where coalesce(p.profile_complete,false))::bigint from public.profiles p where coalesce(p.account_role,'')<>'developer' and not exists(select 1 from public.analytics_internal_accounts ia where ia.user_id=p.id) group by 1,2;

create or replace function public.watchdog_analytics_snapshot(p_hours integer default 720)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
with params as (select greatest(1,least(coalesce(p_hours,720),8760))::integer as hours),
bounds as (select hours,now()-make_interval(hours=>hours) as cutoff from params),
all_filtered as materialized (select e.* from public.watchdog_product_events e,bounds b where e.occurred_at>=b.cutoff),
filtered as materialized (select * from all_filtered where audience_class in ('external_visitor','external_account')),
traffic as (select count(*)::bigint events,count(distinct visitor_id)::bigint visitors,count(distinct session_id)::bigint sessions,count(*) filter(where event_name='page_view')::bigint page_views,min(occurred_at) first_event,max(occurred_at) last_event from filtered),
funnel as (select count(distinct visitor_id) filter(where event_name='page_view')::bigint reached,count(distinct visitor_id) filter(where event_name=any(array['tool_open','marker_viewed','property_lookup_succeeded','export_completed']))::bigint activated,count(distinct visitor_id) filter(where event_name='upgrade_cta_clicked')::bigint upgrade_intent,count(distinct visitor_id) filter(where event_name='checkout_started')::bigint checkout_starts,count(distinct visitor_id) filter(where event_name='subscription_confirmed')::bigint paid_conversions from filtered),
users as (select count(*)::bigint registered_total,count(*) filter(where p.created_at>=b.cutoff)::bigint new_registered,count(*) filter(where p.last_seen>=b.cutoff)::bigint active_registered,count(*) filter(where coalesce(p.marketing_optin,false))::bigint marketing_optins_total,count(*) filter(where coalesce(p.profile_complete,false))::bigint completed_profiles_total from public.profiles p cross join bounds b where coalesce(p.account_role,'')<>'developer' and not exists(select 1 from public.analytics_internal_accounts ia where ia.user_id=p.id)),
onboarding as (select count(*) filter(where o.completed_at is not null)::bigint completed_total,count(*) filter(where o.completed_at>=b.cutoff)::bigint completed_in_range from public.watchdog_onboarding_profiles o cross join bounds b where not exists(select 1 from public.analytics_internal_accounts ia where ia.user_id=o.user_id) and not exists(select 1 from public.profiles p where p.id=o.user_id and coalesce(p.account_role,'')='developer')),
subscriptions as (select count(*) filter(where a.subscription_status in ('active','trialing','past_due','paused'))::bigint active_total,count(*) filter(where a.cancel_at_period_end is true and a.subscription_status in ('active','trialing'))::bigint canceling,count(*) filter(where a.subscription_status='trialing')::bigint trials,count(*) filter(where a.subscription_status='past_due')::bigint past_due,count(*) filter(where a.subscription_status in ('active','trialing','past_due','paused') and a.billing_interval is null)::bigint interval_unknown from public.account_entitlements a where not exists(select 1 from public.analytics_internal_accounts ia where ia.user_id=a.user_id) and not exists(select 1 from public.profiles p where p.id=a.user_id and coalesce(p.account_role,'')='developer')),
billing as (select count(*)::bigint lifecycle_events from public.billing_provider_events,bounds b where occurred_at>=b.cutoff)
select jsonb_build_object(
 'range_hours',(select hours from params),'traffic',(select to_jsonb(traffic) from traffic),'funnel',(select to_jsonb(funnel) from funnel),'users',(select to_jsonb(users) from users),'onboarding',(select to_jsonb(onboarding) from onboarding),'subscriptions',(select to_jsonb(subscriptions) from subscriptions),'billing',(select to_jsonb(billing) from billing),
 'audience_breakdown',(select coalesce(jsonb_agg(to_jsonb(x) order by x.visitors desc),'[]'::jsonb) from (select audience_class,count(distinct visitor_id)::bigint visitors,count(distinct session_id)::bigint sessions,count(*)::bigint events from all_filtered group by audience_class) x),
 'top_pages',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select coalesce(nullif(path,''),'unknown') path,count(*)::bigint events,count(distinct visitor_id)::bigint visitors,count(distinct session_id)::bigint sessions from filtered where event_name='page_view' group by 1 order by events desc limit 20) x),
 'top_events',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select event_name,count(*)::bigint events,count(distinct visitor_id)::bigint visitors from filtered group by event_name order by events desc limit 20) x),
 'top_tools',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select coalesce(nullif(tool,''),'unknown') tool,count(*)::bigint events,count(distinct visitor_id)::bigint visitors from filtered where event_name=any(array['tool_open','marker_viewed','property_lookup_started','property_lookup_succeeded','export_started','export_completed']) group by 1 order by events desc limit 20) x),
 'acquisition',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select coalesce(nullif(session_utm_source,''),nullif(utm_source,''),nullif(session_referrer_host,''),nullif(referrer_host,''),'direct') source,coalesce(nullif(session_utm_medium,''),nullif(utm_medium,''),case when nullif(click_source,'') is not null then 'paid' end,'none') medium,coalesce(nullif(session_utm_campaign,''),nullif(utm_campaign,''),'none') campaign,coalesce(nullif(session_referrer_url,''),nullif(referrer_url,''),'direct') source_url,coalesce(nullif(session_landing_path,''),nullif(landing_path,''),nullif(path,''),'unknown') landing_path,coalesce(nullif(click_source,''),'none') click_source,count(distinct visitor_id)::bigint visitors,count(distinct visitor_id) filter(where event_name=any(array['tool_open','marker_viewed','property_lookup_succeeded','export_completed']))::bigint activated,count(distinct visitor_id) filter(where event_name='checkout_started')::bigint checkout_starts from filtered group by 1,2,3,4,5,6 order by visitors desc limit 30) x),
 'plan_breakdown',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select coalesce(a.plan_tier,'unknown') plan_tier,coalesce(a.billing_tier,'none') billing_tier,coalesce(a.billing_interval,'unknown') billing_interval,coalesce(a.subscription_status,'unknown') subscription_status,coalesce(a.provider,'unknown') provider,count(*)::bigint accounts from public.account_entitlements a where not exists(select 1 from public.analytics_internal_accounts ia where ia.user_id=a.user_id) and not exists(select 1 from public.profiles p where p.id=a.user_id and coalesce(p.account_role,'')='developer') group by 1,2,3,4,5 order by accounts desc) x),
 'billing_events',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select event_type,provider,count(*)::bigint events from public.billing_provider_events,bounds b where occurred_at>=b.cutoff group by event_type,provider order by events desc limit 20) x)
);
$$;

revoke all on function public.watchdog_analytics_snapshot(integer) from public,anon,authenticated;
grant execute on function public.watchdog_analytics_snapshot(integer) to service_role;
revoke all on public.analytics_daily_funnel,public.analytics_tool_usage_daily,public.analytics_acquisition_daily,public.analytics_weekly_retention,public.analytics_intelligence_funnel_daily,public.analytics_intelligence_interactions_daily,public.analytics_product_timeseries,public.analytics_user_growth_timeseries from public,anon,authenticated;
grant select on public.analytics_daily_funnel,public.analytics_tool_usage_daily,public.analytics_acquisition_daily,public.analytics_weekly_retention,public.analytics_intelligence_funnel_daily,public.analytics_intelligence_interactions_daily,public.analytics_product_timeseries,public.analytics_user_growth_timeseries to service_role;