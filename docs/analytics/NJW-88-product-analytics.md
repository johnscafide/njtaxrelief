# NJW-88 — first-party product analytics

## What is collected
Pseudonymous visitor/session UUIDs, pathname, product surface/tool name, event type, first-touch UTM fields, referrer hostname, and a strictly allowlisted small categorical properties object.

## What is intentionally NOT collected
Names, emails, street addresses, PAMS PINs, property-search text, prompts, phone numbers, form contents, credit information, free-text notes, IP addresses in the database, user IDs, profession, or protected/inferred personal traits.

Global Privacy Control and browser Do Not Track disable the browser collector.

## Automatically captured
Core SaaS:
- `page_view`
- `tool_open` on core product routes
- `marker_viewed`
- `property_lookup_started` on form submit only; the input value is not captured
- `export_started`
- `upgrade_cta_clicked`
- `checkout_started`

Watchdog Intelligence:
- `intelligence_exposed` — a governed Intelligence surface/brief became visible
- `intelligence_reasoning_inspected` — the user opened progressive reasoning/evidence
- `intelligence_action_started` — the user selected a categorized next action
- `intent_question_shown` — a high-information-gain intent question was displayed
- `intent_question_answered` — the user selected an answer; the answer value is not copied into product analytics
- `trust_evidence_opened` — the user opened the Trust/source evidence path from Intelligence

The Intelligence browser funnel stores only categorical metadata such as `surface`, `source`, `action`, `status`, and a coarse reason-count bucket. It does not copy the property, prompt, intent payload, or Context Graph evidence into product analytics.

## Governed outcome aggregates
Successful Today and Intent behavior already has a more authoritative owner-scoped trail:
- `intelligence_today_events`
- `intelligence_intent_events`

The developer analytics report reads only aggregate-safe fields from those tables:
- Today: `action`, `created_at`
- Intent: `event_type`, `fact_class`, `created_at`

It does **not** read user IDs, context keys, property identifiers, payloads, evidence refs, addresses, or prompt text. This lets product analytics answer whether Watchdog is becoming useful without creating a second property-behavior profile.

## Explicit success events
Existing application code can record a confirmed success without passing PII:

```js
WatchdogAnalytics.track('property_lookup_succeeded', {tool:'data_workbench', result_count_bucket:'1-10'});
WatchdogAnalytics.track('export_completed', {tool:'data_workbench', format:'csv'});
WatchdogAnalytics.track('subscription_confirmed', {tier:'pro', billing_period:'annual'});
WatchdogAnalytics.track('intelligence_action_completed', {surface:'property_home', action:'open_workbench', status:'completed'});
```

Emit `subscription_confirmed` only after the authoritative billing/webhook flow confirms payment. Emit `intelligence_action_completed` only when the relevant product action actually succeeds; a click alone is `intelligence_action_started`.

## Intelligence funnel views
`supabase/migrations/20260819130000_watchdog_intelligence_product_analytics_funnel.sql` adds:
- `analytics_intelligence_funnel_daily`
- `analytics_intelligence_interactions_daily`

Both views use `security_invoker=true`, revoke browser access from `anon` and `authenticated`, and grant read access only to `service_role`. The developer-only `product-analytics-report` Edge Function exposes aggregates after a server-side `is_watchdog_developer()` check.

The funnel is intended to answer questions such as:
- Did a visitor reach a useful Intelligence surface?
- Did they inspect the reasoning/evidence?
- Did they move toward a next action?
- When Watchdog asked an intent question, did the user answer it?
- Which product surfaces earn meaningful Intelligence interaction?
- Are Today triage and Context Graph interactions recurring over time?

It is **not** intended to answer which named user researched which property.

## Deployment
1. Apply `supabase/migrations/20260813_njw_88_product_analytics.sql`.
2. Apply `supabase/migrations/20260819130000_watchdog_intelligence_product_analytics_funnel.sql`.
3. Deploy anonymous-ingest Edge Function `product-analytics` with `verify_jwt=false`; it remains safe for anonymous ingestion because origin, event names, UUID shape, payload size, and property keys are all strictly allowlisted.
4. Deploy `product-analytics-report` with `verify_jwt=true`.
5. Verify aggregate views and grants.

Useful verification views:
```sql
select * from public.analytics_daily_funnel;
select * from public.analytics_tool_usage_daily;
select * from public.analytics_acquisition_daily;
select * from public.analytics_weekly_retention;
select * from public.analytics_intelligence_funnel_daily;
select * from public.analytics_intelligence_interactions_daily;
```

The underlying tables/views are not exposed to normal browser roles; Edge Functions operate through the intended service/developer boundaries.
