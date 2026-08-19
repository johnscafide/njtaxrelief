# Watchdog for Zapier

Watchdog's Zapier Platform CLI integration connects Zapier to the governed Watchdog Integration Platform through the production `zapier-api` Edge Function.

The product direction is **Zapier-native first, generic webhooks second**: the Zapier app provides the easiest customer setup, while Watchdog's generic webhook transport remains available as a provider-neutral fallback and long-tail integration path.

## Authentication

Custom API-key authentication using `X-Watchdog-Key`. Keys are generated self-service by the authenticated Watchdog `integration-key-manager` function, are displayed once, stored only as SHA-256 hashes, scoped, and may be revoked independently.

Current scopes:

- `zapier.auth`
- `triggers.manage`
- `property.read`
- `watchlist.write`
- `crm.context.write`
- `intelligence.read`
- `intelligence.run`

Intelligence trigger delivery requires explicit `intelligence.read` permission and an Intelligence-enabled connection. Intelligence actions require `intelligence.run` and remain subject to Watchdog plan quotas and job idempotency.

## Instant REST Hook triggers

- Property Signal Changed (`property.signal.changed`)
- Watchlist Alert (`watchlist.alert`)
- Report Ready (`report.ready`)
- Intelligence Finding Created (`intelligence.finding.created`)

Zapier supplies a unique target URL when a Zap is enabled. Watchdog stores that subscription as an outbound integration connection and revokes it when the Zap is disabled. The same governed event/delivery worker handles retries, signatures, delivery history, and connection health.

## Searches

- Find Property
- Get Governed Property Snapshot

The public property contract intentionally excludes owner/person fields. Missing property values remain null rather than being inferred.

## Actions

- Add Property to Watchlist
- Remove Property from Watchlist
- Run Watchdog Intelligence for Property
- Send CRM Context to Watchdog

`Run Watchdog Intelligence for Property` accepts one governed PAMS PIN and one supported model. It uses the existing Intelligence queue, plan limits, and idempotency controls instead of bypassing Watchdog's scoring infrastructure. Passing a stable `source_event_id` from the triggering app provides retry-safe deduplication for that external event.

CRM context remains separate from governed Watchdog property truth. Sending CRM context does not make it authoritative and does not automatically enable it for Watchdog Intelligence.

## Current supported Intelligence models

- Assessment Anomaly (`assessment_anomaly`)
- Property Change Priority (`property_change_priority`)

Additional governed models should only be exposed after their production worker path and calibration state support Zapier-triggered runs.

## Local developer flow

1. Use Node 22.
2. Install dependencies with `npm install`.
3. Run `zapier-platform test` and `zapier-platform validate`.
4. Authenticate the CLI with `zapier-platform login`.
5. Register or link the integration in the Zapier developer platform.
6. Push version `1.1.0` with `zapier-platform push`.
7. Build live beta Zaps for every trigger/search/action and retain successful Zap History runs for publication review.

The Zapier developer deploy key belongs only in the developer environment (`~/.zapierrc`), never in this repository.

## Publication boundary

The remaining App Directory work is external to the Watchdog production API:

- create/link the Watchdog integration in the Zapier Developer Platform
- push the CLI app version
- provide Watchdog API documentation and public app metadata
- run live Zap tests for every public trigger/search/action
- recruit at least three users with live Zaps before publication review
- submit the integration for Zapier review

OAuth can be added later for a smoother account connection, but the current self-service API-key flow is intentionally retained as the v1 authentication path. Do not block the Zapier product launch on an OAuth rewrite.
