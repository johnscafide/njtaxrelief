# Watchdog Integrations — Phase 1 contract

**Status:** Production live on 2026-08-19  
**Plan boundary:** Pro+, Teams, Developer  
**Purpose:** Provide a governed two-way integration boundary before any named CRM or Zapier adapter is published.

## Architecture

`Customer CRM / automation tool ↔ integration-webhook / integration-delivery-worker ↔ integration tables ↔ Watchdog property + Intelligence systems`

The Phase 1 bridge deliberately separates transport from provider-specific logic. Watchdog does not need a CRM password for a generic webhook connection.

## Inbound contract

Endpoint is returned per connection by the Integration Center.

Authentication:

- `X-Watchdog-Token: <one-time-token>` or `Authorization: Bearer <one-time-token>`
- Only the SHA-256 hash of the token is retained by Watchdog.
- Connections can be paused, rotated or revoked.

Accepted event families:

- `integration.test`
- `crm.contact.*`
- `crm.activity.*`
- `crm.lead.*`
- `crm.property.*`

Normalized fields can include contact ID/name/email/phone, relationship, lead stage, activity time, tags and property association/context. Arbitrary raw CRM request bodies are not stored as the CRM context record.

## Outbound contract

Phase 1 production event:

- `property.signal.changed`

Reserved Phase 2+ events already recognized by the gateway:

- `watchlist.alert`
- `report.ready`
- `intelligence.finding.created`

Outbound envelope:

```json
{
  "schema_version": "2026-08-19",
  "delivery_id": "uuid",
  "event_id": "uuid",
  "event_type": "property.signal.changed",
  "event_key": "stable idempotency key",
  "occurred_at": "ISO-8601",
  "source": "watchdog.property_update_events",
  "data": {}
}
```

Headers include:

- `X-Watchdog-Event`
- `X-Watchdog-Delivery`
- `X-Watchdog-Connection`
- `X-Watchdog-Timestamp`
- `X-Watchdog-Signature: v1=<hex HMAC-SHA256>`
- `Idempotency-Key`

Signature input is exactly:

`timestamp + "." + raw_request_body`

The per-connection HMAC secret is generated server-side, stored in Supabase Vault, and shown to the user only when created or rotated.

## Delivery behavior

- Public HTTPS destinations only.
- Redirects are not followed.
- 8-second request timeout.
- Up to five attempts.
- Retry schedule: 1 minute, 5 minutes, 30 minutes, 2 hours, 12 hours.
- Every attempt records status, response code/excerpt, duration and error code.
- A pg_cron job wakes the delivery worker every minute using an internal Vault-backed worker token.

## Intelligence boundary

CRM context is **customer/workflow evidence**, not Watchdog property truth.

`intelligence.context.read` is off by default and must be explicitly enabled per connection. This scope does not grant CRM write access. Future Intelligence tools must preserve field authority and conflicts rather than silently overwriting CRM or governed Watchdog facts.

## Security and privacy decisions

- Integration tables are not directly available to `anon` or `authenticated` browser roles.
- User actions go through `integration-gateway`, which verifies the signed-in user and Pro+/Teams entitlement.
- External inbound webhooks use per-connection token auth because a third-party webhook sender does not have a Watchdog user JWT.
- Outbound signing secrets and the internal delivery-worker token are stored in Supabase Vault.
- Revocation clears usable credentials and cancels pending deliveries.
- Connection mutations and accepted inbound webhooks are audited.
- Generic connection payloads are intentionally allowlisted and normalized to reduce unnecessary CRM-data retention.

## Phase 2 handoff

Phase 2 should build the public Zapier app on these stable contracts rather than bypassing them. Zapier triggers/actions should call the same gateway/event layer so permissions, source authority, audit, retries and tier enforcement stay centralized.
