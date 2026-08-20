# Integrations Phase 8 Certification — 2026-08-20

**Related:** NJW-234, NJW-52  
**Status:** Production acceptance passed

## Purpose

Certify the Watchdog outbound delivery, failure recording, manual replay, idempotency preservation and health recovery path against a real public HTTPS destination without using customer/property/contact data.

## Controlled certification setup

A temporary production webhook connection named `Watchdog Phase 8 Certification` was created with:

- provider: `webhook`
- direction: outbound
- event type: `integration.test`
- payload: synthetic certification metadata only
- PII: none
- signing secret: temporary Supabase Vault secret
- connection and provider control plane: enabled

The original event was:

- event ID: `52c5adaa-94c7-4629-84d3-f4de2d93a754`
- delivery ID: `61f8cdff-32e5-4b9d-9f6d-387e79c85375`

## Failure acceptance

The first real HTTPS destination intentionally returned a non-2xx response.

Attempt 1:

- result: failed
- HTTP status: **503**
- delivery attempt persisted
- `attempt_count`: 1
- health state moved to degraded/failing delivery semantics
- no customer data was transmitted

## Manual replay acceptance

The connection destination was then changed to a successful HTTPS POST endpoint and the delivery was replayed through the production `integration_replay_delivery(...)` RPC under an authenticated user context.

Replay response confirmed:

- same delivery ID
- same original event ID
- idempotency key remained the original event ID
- `manual_replay_count`: **1**
- production delivery worker was kicked by the mediated RPC

Attempt 2:

- result: delivered
- HTTP status: **200**
- duration: 279 ms
- final delivery status: `delivered`
- final `attempt_count`: 2
- `manual_replay_count`: 1
- `last_error`: null
- health state recovered to `healthy`
- health reason: `delivery_succeeded`

## Control-plane implications

The same production delivery worker enforces:

1. provider outbound control
2. provider external-write control
3. provider event-type control
4. connection outbound control
5. connection external-write control
6. connection event-type control
7. active connection/direction/subscription eligibility
8. public HTTPS destination validation
9. signing-secret availability

The replay RPC checks the same provider and connection controls before re-queueing a failed/canceled delivery.

## Cleanup

After certification:

- the temporary connection was revoked;
- its outbound URL was removed;
- its temporary Vault signing secret was deleted;
- the delivery/event/attempt/audit evidence was retained for certification history.

## Acceptance decision

Phase 8's real-world delivery gate is satisfied: a production delivery failed over real HTTPS, the failure was recorded, a mediated manual replay preserved the original governed event identity, the second real HTTPS delivery succeeded, and health recovered automatically.
