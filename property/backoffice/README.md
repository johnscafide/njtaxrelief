# Watchdog Backoffice — Lead Intelligence

Private developer-only operations area at `/property/backoffice/`.

## What is live in this foundation

- Developer-only route protected by the existing Watchdog access guard.
- Supabase `backoffice_leads` and `backoffice_lead_events` tables with RLS.
- Lead queue, search, filters, lead detail, audit history and manual test ingest.
- Separate storage for consumer-submitted data, standardized address data, identity enrichment and CRM status.
- Deterministic Watchdog hashtags derived from program, tenure, intent and estimated benefit.
- Copyable BoldTrail CRM brief while the direct CRM connector is pending.
- Secure server-to-server ingest Edge Function scaffold.

No customer PII is committed to this repository.

## Automation pipeline

`Lead source -> secure server ingest -> Supabase -> address validation -> licensed identity enrichment -> BoldTrail -> audit event`

The original consumer submission is never overwritten by enrichment. Standardized addresses and third-party matches live in separate fields.

## Required server-side credentials

Do not put any of these values in browser JavaScript or GitHub source files.

- `BACKOFFICE_INGEST_SECRET` — shared secret for server-to-server ingest.
- Address provider credential, planned for Google Address Validation.
- Identity enrichment credential, planned for a licensed provider such as Melissa, Trestle or BatchData.
- BoldTrail API/integration credentials or the approved BoldTrail lead-ingestion configuration.

The deployed ingest function intentionally fails closed if `BACKOFFICE_INGEST_SECRET` is not configured.

## Secure ingest request

The Edge Function accepts a `POST` with `x-backoffice-ingest-secret` and either a top-level lead object or `{ "lead": { ... } }`.

Example shape:

```json
{
  "lead": {
    "source": "anchor-estimator",
    "source_event_id": "unique-source-id",
    "full_name": "Example Person",
    "email": "example@example.com",
    "phone": "8565550100",
    "submitted_address": "123 Example St",
    "tenure": "Homeowner",
    "household_income": "Under $150,000",
    "program": "ANCHOR Estimator",
    "intent_score": 40,
    "estimated_benefit": 1500,
    "summary": "[VERIFIED][INTENT 40 ENGAGED][Homeowner] ANCHOR Estimator, est. benefit: $1,500"
  }
}
```

For a public estimator, never call this secret-protected endpoint directly from client-side code. Route the submission through a trusted server-side function or an existing secure submission boundary.

## Provider policy

TruePeopleSearch scraping is intentionally not implemented. Backoffice is designed for an authorized identity-enrichment provider with a stable API and auditable terms. Enriched phones or addresses are supporting intelligence and should not be treated as proof of marketing consent.
