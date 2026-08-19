# Watchdog for Zapier — Publishing Package

**Status:** In progress  
**Connector version:** 1.1.0  
**Linear:** NJW-233  
**Owner:** Watchdog

## Product identity

- App name: Watchdog
- Product name in copy: Watchdog for Zapier
- Category position: Real Estate / Productivity / CRM workflow automation
- Connection label: Watchdog account
- Authentication: self-service Watchdog API key
- Customer setup surface: `/property/integrations/`
- Public Zapier guide: `/property/integrations/zapier/`
- Internal architecture manual: `/property/whitepapers/zapier-watchdog-intelligence/`

## Public connector surface

### Instant triggers

1. Property Signal Changed
2. Watchlist Alert
3. Report Ready
4. Intelligence Finding Created

### Searches

1. Find Property
2. Get Governed Property Snapshot

### Actions

1. Add Property to Watchlist
2. Remove Property from Watchlist
3. Send CRM Context to Watchdog
4. Run Watchdog Intelligence for Property

## Launch copy

### Short description

Connect governed Watchdog property intelligence to the tools your real estate business already uses. Trigger workflows from meaningful property changes, find governed property records, manage Watchlists, pass normalized CRM context, and run approved Watchdog Intelligence analyses from Zapier.

### Long description

Watchdog turns governed property facts and property-level Intelligence into workflow events that can be used across CRM, communication, task, spreadsheet, document and operations tools. Watchdog for Zapier supports instant REST Hook triggers, property searches and governed actions. External context can influence workflow and Intelligence only when explicitly permitted; it does not silently overwrite authoritative Watchdog property facts.

## Authentication support copy

1. Sign in to Watchdog.
2. Open Integration Center.
3. Create a Zapier key.
4. Choose only the capabilities required by the Zaps you plan to use.
5. Copy the key when shown. It is displayed once.
6. In Zapier, connect a new Watchdog account and paste the key.
7. Revoke the key at any time from Watchdog Integration Center.

Never ask a customer to email a Watchdog API key to support.

## Security statements approved for public support

- Watchdog API keys are revocable and capability-scoped.
- A key is shown once and reusable key material is not stored in browser-readable integration tables.
- CRM context is normalized workflow context and remains separate from governed Watchdog property truth.
- Intelligence access is an explicit permission.
- Watchdog Intelligence actions use existing plan limits, queueing and idempotency controls.
- Public property actions do not expose owner/person fields through the Zapier property contract.

## Live-Zap certification matrix

| Type | Public item | Enabled live Zap | Successful history | Negative/permission test | Notes |
|---|---|---:|---:|---:|---|
| Trigger | Property Signal Changed | ☐ | ☐ | ☐ | |
| Trigger | Watchlist Alert | ☐ | ☐ | ☐ | |
| Trigger | Report Ready | ☐ | ☐ | ☐ | |
| Trigger | Intelligence Finding Created | ☐ | ☐ | ☐ | Requires Intelligence read permission |
| Search | Find Property | ☐ | ☐ | ☐ | |
| Search | Get Governed Property Snapshot | ☐ | ☐ | ☐ | |
| Action | Add Property to Watchlist | ☐ | ☐ | ☐ | |
| Action | Remove Property from Watchlist | ☐ | ☐ | ☐ | |
| Action | Send CRM Context to Watchdog | ☐ | ☐ | ☐ | Context is non-authoritative |
| Action | Run Watchdog Intelligence for Property | ☐ | ☐ | ☐ | Requires Intelligence run permission |

## Developer Platform gate

- [ ] Authenticate Zapier Platform CLI in the developer environment.
- [ ] Register or link the Watchdog integration.
- [ ] Confirm Node/tooling versions required by the current connector.
- [ ] Run connector tests.
- [ ] Run connector validation.
- [ ] Push version 1.1.0.
- [ ] Confirm every public item is visible with intentional naming/help text.
- [ ] Confirm sample data contract for all REST Hook triggers.
- [ ] Confirm multiple REST Hook subscriptions can coexist and unsubscribe independently.
- [ ] Complete the live-Zap certification matrix above.
- [ ] Prepare support/test credentials through the approved Watchdog account process.
- [ ] Prepare app branding and listing metadata.
- [ ] Recruit beta users required for publication eligibility.
- [ ] Submit when all external publication gates are satisfied.

## Launch blockers that must not be papered over

- Do not call the app publicly listed until Zapier actually accepts/publishes it.
- Do not mark NJW-233 Done because the connector source exists.
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