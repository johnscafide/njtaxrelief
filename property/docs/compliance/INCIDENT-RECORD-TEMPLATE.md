# Watchdog Incident Record Template

Use this record for material security, privacy, availability, data-integrity, authentication, billing, or multi-customer incidents. Keep it sanitized. Do not paste secrets, access tokens, raw customer data, property records, full request bodies, private keys, or exploit instructions into this record.

## Identification

- **Incident ID:**
- **Opened (UTC):**
- **Closed (UTC):**
- **Severity:** Warning / Critical
- **Incident owner:**
- **Independent verifier:**
- **Affected service/workflow:**
- **Affected release/deployment:**

## Detection

- **Detection source:** Reliability signal / user report / provider alert / security control / other
- **First observed (UTC):**
- **Last observed (UTC):**
- **Sanitized symptom:**
- **Known customer impact:**
- **Potential security/privacy impact:**

## Classification decision

Describe why the event is or is not considered security-relevant, privacy-relevant, availability-relevant, billing-relevant or data-integrity-relevant. Record uncertainty explicitly.

## Evidence retained

List only privacy-minimized evidence needed to support investigation and closure, such as route, release identifier, error class, aggregate occurrence count, timestamps, test result or deployment fingerprint reference.

## Containment

- **Containment decision:**
- **Decision time (UTC):**
- **Rollback / disable / hotfix / provider isolation / other:**
- **Reason:**
- **Known-good path preserved:** Yes / No / Not applicable

## Investigation

- **Recent changes reviewed:**
- **Authorization/entitlement boundary checked:** Yes / No / Not applicable
- **Relevant provider/connector checked:**
- **Source-of-truth comparison completed:** Yes / No / Not applicable
- **Root cause status:** Confirmed / Probable / Unknown
- **Sanitized root cause summary:**

## Recovery verification

- **Authorized flow verified:** Yes / No / Not applicable
- **Unauthorized flow remains denied:** Yes / No / Not applicable
- **Browser → API → database path verified:** Yes / No / Not applicable
- **Error/reliability signal returned to baseline:** Yes / No
- **Production source/inventory reconciled:** Yes / No / Not applicable
- **Verifier and verification time:**

## Communication

- **Customer communication required:** Yes / No
- **Decision rationale:**
- **First customer update (UTC):**
- **External/provider notification required:** Yes / No
- **Regulatory/legal review required:** Yes / No / Undetermined

## Corrective actions

| Action | Owner | Priority | Due date | Evidence path | Status |
|---|---|---|---|---|---|
|  |  |  |  |  |  |

## Closure criteria

- [ ] Affected signal has stopped or is understood and accepted.
- [ ] Customer-impacting flow passes appropriate verification.
- [ ] Authorization/security boundary remains intact where applicable.
- [ ] Emergency production changes are reconciled to source of truth.
- [ ] Required customer/provider communication is complete.
- [ ] Corrective actions have owners and follow-up dates.
- [ ] Record contains no unnecessary sensitive data or credentials.

## Residual risk

Document what remains uncertain or intentionally accepted after closure.

## Lessons learned

Record control improvements, detection improvements, architectural changes, documentation changes or future exercise scenarios arising from the incident.
