# Watchdog Intelligence production runbook

This runbook governs production promotion of the complete Watchdog Intelligence release candidate in PR #63. It covers the deterministic model/calibration layer, Data Workbench and governed actions, population/Daily/Teams infrastructure, page-native Context Intelligence, Semantic Snapshot, deterministic scenarios, Watchdog Analyst, and production operations controls.

Production promotion is intentionally fail-closed. Merging code is not the same as launching Intelligence to customers.

## Current production status — Gate 5 accepted 2026-08-18

The **technical/private production Intelligence promotion is complete and accepted**. This does not mean public customer launch is complete.

Verified production state:

- PR #63 is merged to `main` at merge commit `5060324381d2035d11e1e8b2e2674109b6a72faf`.
- All 43 migrations in the reviewed Intelligence production manifest are present/reconciled in production.
- All **23/23** production-allowlisted Intelligence Edge Functions are deployed on the accepted bundle/auth boundaries.
- `pg_cron`, Vault and the required `pg_net` runtime dependency are available for the reviewed environment-safe dispatcher.
- Vault contains the production worker URL by name; values are not logged into release evidence.
- Production Cron job `2` runs `select private.watchdog_dispatch_intelligence_cron(5);` every five minutes.
- Controlled population canary job `443fc535-5789-495e-8dcc-61680584cae0` completed after exercising resumable retry recovery, processed one governed property and produced one finding/run `a8c40272-b199-402f-ab4b-6fad1de9410e` with worker `watchdog-population-worker-v3-governed-assessment-features`.
- Identical cache canary `c87cf0a6-9785-4a6d-96e9-9099a8426a03` returned `cache_hit` and reused the accepted run/facts lineage.
- The scheduler stop path was explicitly proven by disabling Cron job `2`, verifying it inactive, then re-enabling the same job at the reviewed cadence.
- A redundant Data Workbench catch-all RLS policy discovered by the post-promotion Advisor was removed; the granular owner/team policies using `can_use_data_workbench()` remain the single authorization path. Forward migration: `20260819014000_watchdog_data_workbench_view_policy_dedup.sql`.
- Fresh Performance Advisor output contains **zero WARN-level findings**; remaining entries are informational unused-index observations only.
- Security Advisor findings remain classified against `docs/property/security-definer-audit-2026-08-17.md`. Public score/telemetry and signed-in owner/plan-gated SECURITY DEFINER functions remain intentional product API boundaries. Fail-closed service tables remain closed.
- Supabase leaked-password protection is intentionally deferred on the current Free plan by owner decision and is not an initial-launch blocker. Revisit after at least 10 new users (NJW-217).
- The canary sandbox identity was disabled, Auth-banned and stripped of active sessions/refresh tokens after acceptance; governed run/finding evidence remains for audit.
- Durable acceptance record: `2026-08-18-intelligence-production-gate5-canary`, id `ca422fa6-41fa-4419-887e-de4b2b31f70a`.
- Release gate `intelligence.production_gate5` is **passed**.

Still intentionally closed:

- customer Intelligence visibility;
- paid enrollment;
- Stripe Live webhook.

The remaining public paid-launch gates are the production Stripe Live secret/signing-secret configuration plus controlled real-money lifecycle evidence, and external legal/insurance review. Customer visibility remains last.

## Release gates before promotion

Do not expose customer-facing Intelligence until every applicable launch gate is green:

1. The exact release-candidate head has current authenticated desktop/mobile acceptance and access-boundary acceptance.
2. Assessment calibration remains above the governed minimums: at least 25 genuine human-reviewed cases, precision >=70%, recall >=60%, and false-positive rate <=30%.
3. The real production billing provider has passed controlled Live lifecycle acceptance. Sandbox/history is not a substitute for Live evidence.
4. The feature branch is synchronized with current `main` and the final diff is reviewed.
5. A fresh production schema, extension, function, advisor, entitlement, and rollback baseline is recorded.
6. Required production extensions and secrets are configured deliberately without copying staging values.
7. Production promotion is explicitly authorized before migrations, Edge Functions, worker/scheduler activation, or customer visibility are changed.
8. Existing continuity/restore, legal, support, and platform release gates are not bypassed by the Intelligence release.

The technical/private promotion portion of these controls has now passed as recorded above. If a remaining public-launch gate is unresolved, keep customer visibility fail-closed.

## Production allowlist

`property/intelligence/PRODUCTION-MANIFEST.md` is the authoritative production allowlist. Do not bulk-copy staging functions, fixtures, self-tests, test users, or staging secrets.

### JWT-required Intelligence functions

Deploy only reviewed production-eligible functions, including:

- `intelligence-score-preview`
- `intelligence-normalize-preview`
- `intelligence-run-preview`
- `intelligence-assessment-run-preview`
- `intelligence-change-run-preview`
- `intelligence-closing-run-preview`
- `intelligence-workbench-view-preview`
- `intelligence-property-context`
- `intelligence-calibration-admin`
- `intelligence-analyst`
- `intelligence-learning`
- `intelligence-learning-admin`
- `intelligence-job-submit`
- `intelligence-team`
- `intelligence-team-job-submit`
- `intelligence-operations-admin`
- `intelligence-context-suggestions`
- `intelligence-semantic-context`
- `intelligence-scenario-preview`
- `intelligence-scenario-from-prompt`
- `intelligence-analyst-scenario`
- `intelligence-context-event`

The gateway JWT settings must match `supabase/config.toml` at promotion time.

### Population worker custom authentication

`intelligence-job-worker` is the only production-eligible Intelligence function with gateway `verify_jwt=false`.

It is not an anonymous browser API. It must authorize every request through one of the reviewed internal boundaries:

1. a matching non-expired one-time worker token hash, consumed on use;
2. the production automation/worker secret boundary; or
3. an authenticated Developer JWT verified inside the function.

Never weaken this worker into a publicly callable unauthenticated endpoint.

### Staging-only helpers

Never promote staging self-test, bootstrap, fixture, debug, diagnostic, or disposable-account helpers. `intelligence-preview-review-user` is disabled with HTTP 410 and is not production eligible.

## Model and evidence boundary

Assessment Anomaly v5 is the current calibrated candidate. Historical model versions remain immutable for reproduction and rollback.

Property-level and population-level scoring must consume the pinned model version's governed feature/cohort policy. Do not reintroduce hard-coded worker logic for sale eligibility, sale-recency confidence, cohort minimums/fallbacks, or tax-rate winsorization.

Human calibration rows are staging audit evidence. They are not production seed data.

Watchdog findings must preserve model version, facts hash, evidence coverage, source lineage, and downstream action lineage. Missing or conflicting evidence remains explicit.

## Semantic source-truth boundary

Semantic Snapshot is the governed factual boundary for page-native Intelligence, Analyst factual questions, and deterministic scenarios.

- Competing observations are preserved.
- Canonical observations are selected deterministically by the published source-authority policy and recency rules.
- AI does not choose source truth.
- Unknown, planned, invalid, unavailable, and conflicting markers remain explicit rather than being filled with generated values.
- Scenario calculations consume canonical governed observations plus explicit user assumptions.

## Analyst and scenario boundary

Watchdog Analyst remains usable in deterministic mode without an LLM provider.

- The LLM may provide optional prose/orchestration only.
- It does not receive raw database credentials.
- It does not write arbitrary SQL or perform arbitrary HTTP requests.
- Approved Watchdog tools perform factual operations.
- Financial scenario assumptions are parsed and calculated deterministically.
- Missing required assumptions return an explicit needs-assumptions state; values are not guessed.
- Stateful tool calls are not automatically replayed.

Configure `OPENAI_API_KEY` and `WATCHDOG_ANALYST_MODEL` only if optional prose is intentionally enabled and the selected model/version has been verified.

## Environment-specific scheduler configuration

The recurring population dispatcher must not hard-code a Supabase project URL in a migration or shared SQL definition.

Each environment stores its own worker configuration in Supabase Vault. Production configuration is created deliberately during the authorized promotion window.

Required production secret names include:

- `watchdog_intelligence_worker_url`
- `watchdog_intelligence_worker_token`

The worker URL value must use the production project only, for example:

`https://<production-project-ref>.supabase.co/functions/v1/intelligence-job-worker`

The reviewed scheduler path calls:

```sql
select private.watchdog_dispatch_intelligence_cron(5);
```

The private wrapper resolves the environment-specific worker URL from Vault. If required configuration is absent, dispatch must remain fail-closed rather than falling back to another environment.

Keep recurring scheduler intake disabled until the direct production worker smoke test passes. Enable one controlled scheduled dispatch, verify the stop path, then enable recurring work only after acceptance.

## Promotion sequence

Customer visibility is the last step.

1. Confirm all external and internal release gates are green, including real Live billing acceptance.
2. Confirm the exact release-candidate head and current `main`; review the final compare/diff.
3. Capture a fresh production preflight: schema, migration history, extensions, deployed functions, auth/entitlement state, advisor output, scheduler state, and rollback controls.
4. Confirm the current production backup/restore evidence remains acceptable.
5. Install only required database extensions deliberately. Keep recurring work disabled.
6. Apply repository migrations in timestamp order and stop on any error.
7. Verify migration history, tables, constraints, indexes, RLS, triggers, routines, model registry, current model pointer, and fail-closed scheduler wrapper.
8. Configure production-only secrets deliberately. Do not copy staging values.
9. Deploy only the Edge Functions in `property/intelligence/PRODUCTION-MANIFEST.md` with the pinned auth settings.
10. Re-run security/performance advisors and compare the result with the pre-promotion baseline.
11. Run Developer-only property smoke: Semantic Snapshot -> Assessment / Closing / Change -> finding lineage -> Analyst deterministic mode -> deterministic scenario.
12. Run Standard / Pro / Pro+ / Teams / Developer entitlement smoke tests.
13. Re-test Teams organization RLS with owner/member/viewer/outsider identities.
14. Run one small direct population job with recurring scheduler still disabled.
15. Verify job state, cache behavior, Daily digest, usage/quota telemetry, and Operations visibility.
16. Configure/verify the production worker URL/token and run one controlled scheduled-dispatch acceptance.
17. Prove the scheduler stop/disable path immediately after that acceptance.
18. Test deterministic Intelligence with the optional LLM provider intentionally unavailable.
19. Perform the rollback drill appropriate to the release candidate.
20. Enable recurring work only if scheduler acceptance is clean.
21. Enable calibrated customer visibility last.
22. Record the production acceptance evidence and only then mark the release launched.

If deployment architecture requires code to merge before some production smoke steps, use release configuration/visibility controls that keep Intelligence inaccessible until every remaining gate passes. Do not equate “merged” with “launched.”

## Plan boundaries

- Standard: no paid Intelligence entitlement.
- Pro: property-level Assessment Intelligence and approved Pro tools.
- Pro+: population/scheduled Intelligence, Change Intelligence, Daily Intelligence, and approved Pro+ tools.
- Teams: explicit organization membership and governed shared scopes/runs/findings with role-based boundaries.
- Developer: calibration, operations, diagnostics, and release controls.

The database/server entitlement contract is the enforcement boundary. Frontend labels and View As presentation are not trusted authorization.

## Monitoring gates

Before customer rollout, verify at minimum:

- no unexplained new Supabase security-advisor errors from the promoted objects;
- population job failure rate is acceptable for the controlled production smoke workload;
- no stale running jobs beyond the worker lease threshold;
- representative completion latency is acceptable;
- evidence coverage and missing-evidence labels remain visible;
- source conflicts preserve all governed observations and canonical selection lineage;
- Analyst provider state/token usage is visible when applicable;
- provider cost is shown only when an explicit versioned cost record exists;
- scheduled scopes advance after both computed runs and cache hits;
- Teams members can read allowed shared runs/findings and outsiders cannot;
- model/version/facts lineage remains queryable after Case, Report, Watchlist, feedback, and value/outcome actions;
- public Support/Status surfaces remain privacy-safe and operational.

## Rollback

Rollback is fail-closed and non-destructive.

1. Disable customer-visible Intelligence entry points/feature visibility.
2. Stop new recurring work by unscheduling/disabling the Intelligence Cron job or removing the environment-specific worker URL from Vault.
3. Prevent new population submissions while preserving historical governed runs/findings for audit.
4. Mark queued/partial jobs canceled only when they should not resume; do not delete completed history.
5. Redeploy the prior known-good Edge Function versions when an API/worker regression caused the incident.
6. Demote the affected model/version pointer rather than rewriting historical findings.
7. Preserve evidence batches, facts hashes, calibration history, outcomes, feedback, Semantic Snapshot lineage, and completed runs.
8. Use a forward corrective migration for schema fixes rather than editing production migration history.
9. Re-run advisor checks and the smallest deterministic smoke test before re-enabling submissions, scheduler activity, or customer visibility.

## Production acceptance record

Record at minimum:

- deployed Git commit;
- merge/release timestamp;
- Supabase migration versions;
- deployed Edge Function versions and auth settings;
- model/version states;
- Semantic Snapshot/scenario/Analyst contract versions;
- entitlement smoke results;
- Teams RLS smoke results;
- representative property/population smoke evidence;
- Cron job ID and controlled scheduler acceptance;
- security/performance advisor delta;
- rollback/stop-path verification;
- Live billing lifecycle evidence reference;
- backup/restore evidence reference;
- person explicitly authorizing production promotion.

This creates a reproducible boundary between staging acceptance, merged code, and actual customer launch.
