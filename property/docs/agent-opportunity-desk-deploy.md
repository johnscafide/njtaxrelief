# Agent Opportunity Desk deployment

## Upload/deploy order

1. Apply `supabase/migrations/20260809213000_agent_opportunity_desk.sql` in the Supabase SQL Editor.
2. Deploy the `agent-opportunity-digest` Edge Function.
3. Add the Edge Function secrets below.
4. Create an EmailJS template for the weekly digest.
5. Add the two GitHub Actions secrets below.
6. Upload the static `/property` files.

## Edge Function secrets

- `EMAILJS_PUBLIC_KEY` (existing)
- `EMAILJS_PRIVATE_KEY` (existing; never place it in browser JavaScript)
- `EMAILJS_SERVICE_ID` (existing)
- `EMAILJS_AGENT_DIGEST_TEMPLATE_ID` (new; suggested `template_agentdesk`)
- `AGENT_DIGEST_CRON_SECRET` (new random value of at least 32 characters)

The EmailJS template should render:

- `{{subject}}`
- `{{opportunity_count}}`
- `{{{digest_rows}}}` as HTML
- `{{desk_url}}`
- `{{compliance_note}}`

## GitHub Actions secrets

- `SUPABASE_AGENT_DIGEST_URL`: `https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/agent-opportunity-digest`
- `AGENT_DIGEST_CRON_SECRET`: exactly the same value configured on the Edge Function

The Action calls the function hourly. The function itself evaluates each user's timezone, preferred weekday/hour, and last-send timestamp, so it sends at most once per eligible week.

## Security model

- All three tables use RLS and require `auth.uid() = user_id` plus a server-verified Pro entitlement.
- Anonymous users receive no table grants.
- Imported rows contain addresses and optional internal CRM references, never harvested owner names or contact details.
- The digest endpoint rejects requests without the independent cron secret.
- The service role and EmailJS private key stay exclusively in the Edge Function environment.

## Verification

1. Sign in as Pro and open `/property/agent-desk`.
2. Import two saved properties and a CSV row.
3. Confirm another account cannot read the imported records.
4. Open an evidence drawer and confirm source, timestamp, four score components, limitation, and conversation starter.
5. Exercise quick-watch, snooze, dismiss, and each outcome.
6. Confirm the analytics counters update.
7. Use `workflow_dispatch` on **Agent Opportunity weekly digest** after temporarily setting the test preference to the current weekday/hour.
