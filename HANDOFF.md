# Watchdog production handoff

This is the canonical operator handoff for Watchdog. It is intentionally concise and points to the governed runbooks that contain detailed procedures. Do not place credentials, raw IP addresses, payment secrets, private customer data, or other secrets in this file.

## Production identity

- Canonical public host: `https://www.watchdogindex.com`.
- GitHub production branch: `main` in `johnscafide/njtaxrelief`.
- Production Supabase project ref: `uvkvaxljhhngydvlrzom`.
- Before any production mutation, confirm the Supabase project is `ACTIVE_HEALTHY` and inspect the current deployed schema/function state.
- Supabase boundary/runbook: `property/docs/supabase-project-boundary.md`.

## Paid launch posture

- Stripe is the authority for new paid subscriptions.
- Paid entitlement changes are server-owned and may follow only signed, normalized billing evidence.
- Public paid enrollment remains **controlled / not yet open**.
- Do not open broad checkout or weaken entitlement gates to manufacture launch acceptance.
- Teams self-service remains closed unless separately authorized.
- Current external launch controls: `property/docs/public-paid-launch-external-controls.md`.
- Counsel/insurance checklist: `property/docs/public-paid-launch-counsel-insurance-checklist.md`.
- Current cutover state: `property/docs/public-paid-launch-cutover-state.json`.
- Billing operations: `property/docs/billing-support-runbook.md`.

## Remaining launch controls

Do not mark these passed without real evidence:

1. Counsel review and final LLC/operator/professional-service language.
2. Bound E&O / technology liability / cyber coverage, or an explicit owner accepted-risk decision supported by a real evidence reference.
3. Written New Jersey sales-tax classification for the actual Agent / Pro / Pro+ plan mix.
4. First controlled New Jersey Stripe Tax calculation on or after **2026-09-16**.
5. Explicit owner public-cutover authorization after the preceding blockers are satisfied.

## Data and model governance

- ROBUST-v1 remains the canonical Watchdog Score model unless governed evidence explicitly supports a version change.
- Never invent missing evidence, municipality statistics, eligibility conclusions, appraisal conclusions, legal conclusions, vendor contracts, or tax determinations.
- Missing governed evidence remains missing/null and must fail closed where required.
- State-data refresh runbook: `property/docs/refresh.md`.
- Continuity and restore runbook: `property/docs/continuity-and-restore.md`.

## Security and anti-extraction posture

- Private anti-scraping telemetry lives in the Supabase `watchdog_security` schema.
- Review `public_request_security_events` and `public_request_rate_limits` during operating checks.
- Review current Vercel production runtime logs for `rate_limited`, `bulk_sales_blocked`, `automation_client_blocked`, repeated `invalid_scope`, abnormal scoped-sales request volume, and protection failures.
- Do not expose raw IP addresses. Use privacy-safe hashes/aggregates when evidence must be recorded.
- These controls provide extraction friction and detection around public-record-derived information. They do **not** make public records secret.
- Security backlog/control issue: NJW-37.

## Safe production-change sequence

1. Read the mapped Linear issue and current comments/evidence.
2. Fetch current GitHub `main` and current target-file SHA immediately before every write.
3. Inspect the relevant production Supabase state before changing code, functions, schema, RLS, or configuration.
4. Preserve RLS, entitlements, privacy boundaries, ROBUST/Watchdog Score governance, and fail-closed launch controls.
5. Make the smallest evidence-supported change that completes the selected backlog item.
6. Verify the resulting GitHub commit and the corresponding production deployment/runtime state as far as connected tooling allows.
7. Record concrete evidence on the existing Linear issue; do not create duplicate backlog.

## Low-touch operating references

- Customer support/status/continuity and external launch controls: NJW-89.
- Low-touch operations target: NJW-32.
- Production availability check: `.github/workflows/production-uptime-check.yml`.
- State data refresh: `.github/workflows/state-data-refresh.yml`.
- Billing support contract: `.github/workflows/billing-support-contract.yml`.
- Anti-scrape contract: `.github/workflows/njw37-anti-scrape-contract.yml`.

## Credential continuity

Credentials belong in an approved password manager, not GitHub, Linear, Supabase rows, or this handoff. Emergency-access ownership and the designated recovery contact are external operational controls and must be evidenced in the password-manager/owner record rather than copied into the repository.
