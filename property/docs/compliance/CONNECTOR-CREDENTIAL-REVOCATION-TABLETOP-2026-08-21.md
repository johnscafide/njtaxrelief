# Connector Credential Revocation Tabletop — 2026-08-21

**Budget:** $0 internal exercise  
**Framework mapping:** SOC 2 Security/Availability; NIST CSF 2.0 Detect/Respond/Recover; OWASP ASVS authentication/secure communications; ISO/IEC 27001 incident and supplier controls; NJDPA security safeguards.

## Objective

Exercise Watchdog's response to suspected compromise of a credential used by a material CRM/integration connector without exposing a real credential or relying on a paid security service.

## Scenario

Operations receives credible evidence that a reusable credential associated with a Tier 1 CRM connector may have been disclosed outside its intended trust boundary. There is no confirmed customer-data exfiltration at the start of the exercise. The affected connector may have queued work and normalized CRM context already stored in Watchdog.

## Required response sequence

1. **Classify and contain.** Treat the event as a security incident until evidence lowers severity. Pause or revoke the affected connection and stop future scheduled work/delivery before investigating convenience or uptime impacts.
2. **Revoke the credential at its authoritative location.** Remove or rotate the Vault/provider credential reference through the supported server-side path. Never copy credential values into tickets, logs, chat, screenshots, or compliance evidence.
3. **Invalidate dependent work.** Cancel or quarantine pending deliveries/sync jobs that could execute with the suspect credential. Preserve identifiers and timestamps needed for investigation without retaining unnecessary payload bodies.
4. **Establish blast radius.** Review connection-level audit history, sync/delivery summaries, authentication failures, configuration changes, and the time window in which the credential may have been usable. Determine whether the credential was scoped to one customer/connection or could affect broader infrastructure.
5. **Protect customer data.** Determine whether personal data, authentication data, or customer CRM context was accessed, altered, exported, or forwarded. Escalate to the privacy/incident process if unauthorized personal-data access is reasonably suspected.
6. **Recover safely.** Only issue/store a replacement credential after the cause of exposure is understood sufficiently to avoid immediate re-exposure. Revalidate least privilege and provider/account ownership before resuming synchronization or delivery.
7. **Verify.** Confirm the revoked credential can no longer authorize the intended operation, pending work using the old credential cannot execute, the replacement path functions if needed, and normal connector health is restored.
8. **Close with evidence.** Record incident timeline, affected connector/connection identifiers, actions, verification evidence, residual risk, and corrective actions. Do not record secrets or unnecessary customer payloads.

## Existing controls exercised

- Generic webhook connections support connection revocation, clearing the inbound token hash and outbound secret reference, deletion of the Vault signing secret, and cancellation of pending deliveries.
- BoldTrail/kvCORE Direct stores reusable provider credentials in Supabase Vault and its disconnect/reconnect paths are designed to remove old secret references.
- Internal connector workers use dedicated server-side credentials rather than browser-readable provider tokens.
- Integration audit, delivery, and sync-run history provide connection-level investigation evidence while normalized CRM storage is intentionally allowlisted.

## Tabletop findings

### Finding CR-1 — Revocation capability exists, but evidence must be retained per material connector

**Result:** Partial pass. The connector register documents implemented revocation/offboarding paths for the generic bridge and BoldTrail Direct, but the program does not yet retain a dated, repeatable credential-revocation verification for every Tier 1 connector.

**Treatment:** Add a sanitized revocation-test record at first production acceptance and after material authentication changes. Evidence should identify the connector, test date, credential category, expected denial after revocation, result, and reviewer, never the credential value.

### Finding CR-2 — Blast-radius evidence is connector-specific

**Result:** Partial pass. Audit/delivery/sync history exists for reviewed CRM connectors, but the exact telemetry needed to establish misuse windows varies by provider.

**Treatment:** Add a minimum incident-evidence field to every Tier 1 connector review: authoritative credential location, revocation mechanism, audit source, queued-work cancellation mechanism, and provider-side activity source if available.

### Finding CR-3 — Replacement must not become automatic recovery

**Result:** Pass as policy decision. Immediate replacement without understanding the exposure path can recreate the incident.

**Treatment:** Require containment and exposure-path review before reconnecting a material connector, except where emergency business-continuity procedures explicitly accept and document the residual risk.

### Finding CR-4 — Customer/privacy escalation threshold must remain explicit

**Result:** Pass as response rule. A credential incident is not automatically a personal-data breach, but evidence of unauthorized access to CRM/contact context requires privacy-impact evaluation and the incident-response process.

**Treatment:** Keep connector incident records linked to the data inventory and DPA rather than treating connector credentials as infrastructure-only events.

## Exercise result

**Overall:** Passed with follow-up actions. Watchdog has documented containment and revocation mechanisms for its currently reviewed CRM connector architecture, and the response sequence is coherent. Operating effectiveness remains incomplete until sanitized real/staging revocation evidence is retained per Tier 1 connector.

## Residual risk

Provider-side token behavior, revocation propagation time, audit-log availability, and account-specific API permissions can differ. A tabletop does not prove provider-side revocation behavior or measure actual recovery time.

## Next no-cost actions

1. Extend the connector register template with explicit incident-evidence/revocation-verification fields.
2. Retain a dated sanitized revocation verification whenever a Tier 1 connector completes production acceptance or materially changes authentication.
3. Run the next exercise against a different failure class, such as analytics telemetry leakage or unauthorized privileged-account access.
