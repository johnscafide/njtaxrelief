-- Initiative #9: privacy-minimized Watchdog Intelligence funnel analytics.
-- No address, PAMS PIN, search text, prompt text, user profile, or free-form content belongs here.

alter table public.watchdog_product_events
  drop constraint if exists watchdog_product_events_event_name_check;

alter table public.watchdog_product_events
  add constraint watchdog_product_events_event_name_check check (event_name in (
    'page_view','tool_open','marker_viewed','property_lookup_started','property_lookup_succeeded',
    'export_started','export_completed','upgrade_cta_clicked','checkout_started','subscription_confirmed',
    'intelligence_exposed','intelligence_reasoning_inspected','intelligence_action_started','intelligence_action_completed',
    'intent_question_shown','intent_question_answered','intent_question_skipped',
    'today_item_reviewed','today_item_snoozed','today_item_dismissed','today_item_reopened',
    'trust_evidence_opened'
  ));

create or replace view public.analytics_intelligence_funnel_daily
with (security_invoker=true) as
select
  occurred_at::date as day,
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
where event_name in (
  'intelligence_exposed','intelligence_reasoning_inspected','intelligence_action_started','intelligence_action_completed',
  'intent_question_shown','intent_question_answered','intent_question_skipped',
  'today_item_reviewed','today_item_snoozed','today_item_dismissed','today_item_reopened','trust_evidence_opened'
)
group by 1
order by 1 desc;

create or replace view public.analytics_intelligence_interactions_daily
with (security_invoker=true) as
select
  occurred_at::date as day,
  event_name,
  coalesce(nullif(properties->>'surface',''),nullif(tool,''),'unknown') as surface,
  coalesce(nullif(properties->>'action',''),'none') as action,
  coalesce(nullif(properties->>'status',''),'none') as status,
  count(*) as events,
  count(distinct visitor_id) as visitors,
  count(distinct session_id) as sessions
from public.watchdog_product_events
where event_name in (
  'intelligence_exposed','intelligence_reasoning_inspected','intelligence_action_started','intelligence_action_completed',
  'intent_question_shown','intent_question_answered','intent_question_skipped',
  'today_item_reviewed','today_item_snoozed','today_item_dismissed','today_item_reopened','trust_evidence_opened'
)
group by 1,2,3,4,5
order by 1 desc,6 desc;

revoke all on public.analytics_intelligence_funnel_daily, public.analytics_intelligence_interactions_daily from anon, authenticated;
grant select on public.analytics_intelligence_funnel_daily, public.analytics_intelligence_interactions_daily to service_role;
