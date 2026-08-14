# Marketing Studio provider adapters

Marketing Studio is provider-neutral. Product workflows target capabilities, not vendor-specific endpoints.

## Provider lifecycle

Every provider has a stable `provider_key`, `provider_type`, capability document and connection mode:

- `not_connected`
- `sandbox`
- `live`
- `degraded`

Credentials must remain in server-side secrets or an OAuth token store. Never place provider credentials in browser JavaScript, HTML, public tables or GitHub.

## Adapter contract

A provider adapter should normalize these operations where the capability applies:

1. `health` / connection validation
2. `quote` without accepting a browser-authoritative price
3. `validate` campaign payload
4. `submit` using an idempotency key
5. `status` / retrieve provider job
6. `cancel` when the provider permits it
7. `webhook` normalization into `marketing_events`
8. `cost` reconciliation into the provider job / campaign ledger

Adapters declare capabilities rather than forcing every provider to implement every operation.

## Money boundary

Provider submission that can incur cost is server-only. A paid job must reference a server-generated quote and a verified/captured campaign payment unless a developer-only sandbox path explicitly bypasses payment. Retail price, plan discount, provider cost and Watchdog margin are separate values.

## Audience and compliance boundary

Watchdog audiences are based on governed property intelligence. Do not convert Marketing Studio into demographic owner profiling. Email/SMS require consent/suppression checks. Advertising adapters must respect provider policies and may not upload Watchdog property-owner records as custom audiences unless a separately reviewed workflow explicitly permits it.

## Adding a provider

1. Register provider metadata and capabilities in `marketing_providers`.
2. Add server-side secrets/OAuth configuration.
3. Implement the normalized adapter operations.
4. Add sandbox fixtures and idempotency tests.
5. Map provider webhooks/events to normalized statuses.
6. Add pricing inputs to the server pricing engine.
7. Expose the provider only after entitlement, compliance and payment checks pass.

PCM is the first direct-mail adapter. Existing `pcm_direct_mail_orders` remain supported while PCM is bridged into `marketing_provider_jobs`; do not break existing campaigns during migration.
