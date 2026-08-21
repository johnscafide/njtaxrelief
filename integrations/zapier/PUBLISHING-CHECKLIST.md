# Watchdog for Zapier — Publishing Package

**Status:** In progress  
**Connector version:** 1.1.0  
**Linear:** NJW-233  
**Owner:** Watchdog

## Product identity

- App name: Watchdog
- Product name in support copy: Watchdog for Zapier
- Category position: Real Estate / Productivity / CRM workflow automation
- Connection label: non-secret Watchdog key label returned by `auth.test`
- Authentication: self-service Watchdog API key
- Customer setup surface: `/property/integrations/`
- Public Zapier setup/API/support guide: `/property/integrations/zapier/`
- Internal architecture manual: `/property/whitepapers/zapier-watchdog-intelligence/`

## Current external evidence snapshot — 2026-08-21

Production state was re-checked before this publishing pass:

- Zapier API keys in production: **0**
- Zapier integration connections in production: **0**
- Zapier provider connections in production: **0**
- Therefore there is currently **no honest live-Zap history or real-user demand evidence to certify**.

This is an external acceptance state, not a connector failure. Do not manufacture keys, users, Zap History, beta evidence or provider activity to satisfy publishing checks.

Current Zapier publishing requirements were re-checked on 2026-08-21 against Zapier's official documentation, including the publishing-requirements, validation-checks, connection-label and test/monitoring guidance. The externally gated requirements still include a non-expiring review account using `integration-testing@zapier.com`, live turned-on Zaps and successful Zap History for every visible public surface, and real user demand before publication.

## Public connector surface

### Instant triggers

1. Property Signal Changed
2. Watchlist Alert
3. Report Ready
4. Intelligence Finding Created

### Searches

1. Find Property
2. Find Governed Property Snapshot

### Actions

1. Add Property to Watchlist
2. Remove Property from Watchlist
3. Send CRM Context to Watchdog
4. Run Watchdog Intelligence for Property

## Engineering preflight completed

Completed in-repository before Zapier-side certification:

- [x] Connector version pinned to `1.1.0`.
- [x] Node runtime requirement pinned to Node 22+ and Zapier CLI/core pinned to `18.5.1`.
- [x] Removed the recursive `npm test -> zapier-platform test -> npm test` configuration. `npm test` now runs Node's built-in test runner directly.
- [x] Added publication contract tests for the 4 trigger / 2 search / 4 action catalog, API-key auth boundary, REST Hook lifecycle, output-key uniqueness and trigger sample/output parity.
- [x] Added `.github/workflows/zapier-connector-contract.yml` as a dedicated Node 22 test/validation gate.
- [x] Replaced the generic REST Hook output-field union with event-specific schemas for all four instant triggers.
- [x] Matched static trigger samples to the current production Watchdog event generator contracts.
- [x] Renamed the second search display label to `Find Governed Property Snapshot` to follow Zapier search naming guidance without changing its stable internal key.
- [x] Updated the public Watchdog Zapier support guide to use the same search name.
- [x] Added a safe connection label contract using the non-secret key label returned by the authentication test. The API key is never used as a connection label.
- [x] Expanded the public guide into an indexable production API reference covering the endpoint, authentication, scopes, REST Hook lifecycle, all public searches/actions, supported event/model allowlists, HTTP behavior and governance boundaries.

These checks reduce publication risk, but they do not substitute for Zapier's own validation, live-Zap history checks, user-demand checks, review-account validation or App Directory review.

## Launch copy

### App Directory short description

Watchdog is a property intelligence platform for governed property monitoring, Watchlists, reports, CRM workflow context and property-level Intelligence.

### Longer support description

Watchdog turns governed property facts and property-level Intelligence into workflow events that can be used across CRM, communication, task, spreadsheet, document and operations tools. The integration supports instant REST Hook triggers, property searches and governed actions. External context can influence workflow and Intelligence only when explicitly permitted; it does not silently overwrite authoritative Watchdog property facts.

## Authentication support copy

1. Sign in to Watchdog.
2. Open Integration Center.
3. Create a Zapier key.
4. Choose only the capabilities required by the Zaps you plan to use.
5. Copy the key when shown. It is displayed once.
6. In Zapier, connect a new Watchdog account and paste the key only in the authentication form.
7. Zapier identifies the connection with the key's non-secret Watchdog label.
8. Revoke the key at any time from Watchdog Integration Center.

Never ask a customer to email a Watchdog API key to support.

## Security statements approved for public support

- Watchdog API keys are revocable and capability-scoped.
- A key is shown once and reusable key material is not stored in browser-readable integration tables.
- CRM context is normalized workflow context and remains separate from governed Watchdog property truth.
- Intelligence access is an explicit permission.
- Watchdog Intelligence actions use existing plan limits, queueing and idempotency controls.
- Public property actions do not expose owner/person fields through the Zapier property contract.
- The connector calls the production Watchdog HTTPS endpoint, not a sandbox/test/dev API.
- Authentication credentials are requested only through the connector authentication configuration.

## Live-Zap certification matrix

| Type | Public item | Enabled live Zap | Successful history | Negative/permission test | Notes |
|---|---|---:|---:|---:|---|
| Trigger | Property Signal Changed | ☐ | ☐ | ☐ | |
| Trigger | Watchlist Alert | ☐ | ☐ | ☐ | |
| Trigger | Report Ready | ☐ | ☐ | ☐ | |
| Trigger | Intelligence Finding Created | ☐ | ☐ | ☐ | Requires Intelligence read permission |
| Search | Find Property | ☐ | ☐ | ☐ | |
| Search | Find Governed Property Snapshot | ☐ | ☐ | ☐ | |
| Action | Add Property to Watchlist | ☐ | ☐ | ☐ | |
| Action | Remove Property from Watchlist | ☐ | ☐ | ☐ | |
| Action | Send CRM Context to Watchdog | ☐ | ☐ | ☐ | Context is non-authoritative |
| Action | Run Watchdog Intelligence for Property | ☐ | ☐ | ☐ | Requires Intelligence run permission |

## Closure gates — remaining before NJW-233 can be Done

### A. Zapier Developer Platform

- [ ] Authenticate the Zapier Platform CLI in the developer environment.
- [ ] Register or link the Watchdog integration.
- [ ] Run `zapier-platform test` against the linked integration environment.
- [ ] Run Zapier's current validation/publishing checks and clear all blocking Errors and Publishing Tasks.
- [ ] Push connector version `1.1.0`.
- [ ] Confirm every public trigger/search/action appears with the intended label, help text, inputs and outputs in the Zap editor.
- [ ] Confirm the `{{key_label}}` connection label renders correctly from the `auth.test` response in the linked integration.

### B. Live trigger certification

- [ ] Confirm static/fallback samples are a subset of the corresponding live result shape.
- [ ] Confirm live REST Hook result fields respect each trigger's output-field definition.
- [ ] Confirm ISO-8601 dates in real Zap History runs.
- [ ] Confirm multiple subscriptions for the same Watchdog account can coexist.
- [ ] Confirm disabling one Zap unsubscribes only its own REST Hook subscription.
- [ ] Confirm retry/delivery behavior does not create duplicate user-visible results.

### C. Live Zap evidence for all 10 public surfaces

- [ ] Turn on at least one live Zap for every visible trigger, search and action.
- [ ] Produce and retain at least one successful Zap History run for every visible trigger, search and action.
- [ ] Complete the live-Zap certification matrix above.
- [ ] Run permission-negative cases, especially `intelligence.read`, `intelligence.run`, revoked keys and insufficient plan access.
- [ ] Preserve Watchdog event/job/delivery IDs alongside Zap History evidence for reviewability.

### D. Publication/support package

- [x] Publish clear public API documentation covering the Watchdog API surfaces used by the integration.
- [x] Finalize the public support article, troubleshooting copy and account-connection instructions for the current connector contract.
- [x] Make the public Zapier API/support guide indexable while retaining explicit private-integration/publishing-in-progress status.
- [ ] Create a non-expiring, fully functional Zapier review/demo account using `integration-testing@zapier.com` through the approved Watchdog account process, with all features required to test the 10 public surfaces.
- [ ] Verify app name uniqueness, category, App Directory description, homepage, logo, connection label and support ownership inside the Zapier Developer Platform.
- [ ] Ensure at least one Zapier integration admin uses an email address from the Watchdog application's/API's top-level domain, as required for public review.
- [ ] Verify legal/publishing metadata and applicable Zapier Platform terms are accepted by the authorized owner.

### E. Demand and external testing

- [ ] Recruit at least three distinct real users with live Zaps using the integration.
- [ ] Confirm each qualifying live Zap has a recent successful run.
- [ ] Gather beta feedback and correct any setup or field-mapping friction before submission.

### F. Submission and closure

- [ ] Submit Watchdog for Zapier for Zapier review when all blocking checks are clear.
- [ ] Respond to any Zapier review findings without weakening Watchdog authorization, truth boundaries, plan limits or idempotency.
- [ ] Only call the integration publicly listed after Zapier actually approves/publishes it.
- [ ] Update Watchdog public copy from private-integration/publishing-in-progress language when publication status changes.
- [ ] Attach final certification evidence to NJW-233 and mark it Done only after the external publication gate has actually been reached or passed.

## Launch blockers that must not be papered over

- Do not call the integration publicly listed until Zapier actually accepts/publishes it.
- Do not mark NJW-233 Done because the connector source or public API documentation exists.
- Do not fabricate real users, Zap History, live-Zap runs, test-account evidence or Zapier Platform validation.
- Do not expose a broader Intelligence model catalog through Zapier until each model has a governed production worker path suitable for external triggering.
- Do not bypass API-key scopes, plan limits or idempotency for test convenience.
- Do not use synthetic CRM-to-property relationships to simulate production acceptance.

## Evidence to retain

For each certification run retain:

- Zap name
- connected Watchdog key label (never the secret)
- public trigger/search/action exercised
- test input/property identifier safe for certification
- Zap run timestamp
- Zap History success/failure evidence
- Watchdog event/job/delivery identifier when applicable
- permission or plan state
- expected result
- actual result
- corrective action if failed

This document is the operational launch checklist. The architecture and future roadmap remain in the Watchdog Automation Fabric whitepaper.
