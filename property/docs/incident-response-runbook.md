# Incident response runbook

## Severity

- **Warning:** a recoverable client error or a slow route that has repeated five times for the same release and UTC day.
- **Critical:** an unhandled error/rejection, or a warning signal whose recurrence crosses the critical threshold.

## Respond

1. Open the developer-only Reliability Center and record the route, release, first/last seen time and occurrence count.
2. Reproduce in a private session at the reported viewport. Do not request property records, addresses or authentication tokens from the customer.
3. Check Edge Function logs and the latest deployment changes for the affected route.
4. Acknowledge the incident in the operating log, name an owner and decide: mitigate, roll back or hotfix.
5. Verify the full browser → API → database response after the fix.
6. Resolve only when the signal has stopped and the affected customer flow passes.

## Customer communication

State what customers experienced, when it began, the affected feature and the next update time. Do not expose internal stack traces, user IDs, property identifiers or provider secrets. Publish a short post-incident note for any paid-flow, authentication, data-integrity or multi-customer outage.

## Retention and privacy

Reliability events are sanitized before ingestion. Keep route, release, error class, compact message, viewport class and timing. Never add query strings, addresses, parcel records, email addresses, tokens or full request bodies.
