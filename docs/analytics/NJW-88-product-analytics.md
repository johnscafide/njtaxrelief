# NJW-88 — first-party product analytics

## What is collected
Pseudonymous visitor/session UUIDs, path, tool name, event type, first-touch UTM fields, referrer hostname, and an allowlisted small properties object.

## What is intentionally NOT collected
Names, emails, street addresses, property-search text, phone numbers, form contents, credit information, free-text notes, IP addresses in the database, or protected/inferred personal traits.

Global Privacy Control and browser Do Not Track disable the browser collector.

## Automatically captured
- page_view
- tool_open on core product routes
- marker_viewed
- property_lookup_started (form submit only; input value is not captured)
- export_started
- upgrade_cta_clicked
- checkout_started

## Explicit success events
Existing application code can record a confirmed success without passing PII:

```js
WatchdogAnalytics.track('property_lookup_succeeded', {tool:'data_workbench', result_count_bucket:'1-10'});
WatchdogAnalytics.track('export_completed', {tool:'data_workbench', format:'csv'});
WatchdogAnalytics.track('subscription_confirmed', {tier:'pro', billing_period:'annual'});
```

Emit `subscription_confirmed` only after the authoritative billing/webhook flow confirms payment.

## Deployment
1. Apply `supabase/migrations/20260813_njw_88_product_analytics.sql`.
2. Deploy anonymous-ingest Edge Function:
   `npx supabase functions deploy product-analytics --project-ref uvkvaxljhhngydvlrzom --no-verify-jwt`
3. Upload the website files.
4. Verify events with:
   `select * from public.analytics_daily_funnel;`
   `select * from public.analytics_tool_usage_daily;`
   `select * from public.analytics_acquisition_daily;`
   `select * from public.analytics_weekly_retention;`

The tables/views are not exposed to anon/authenticated clients; the Edge Function writes through the service role.
