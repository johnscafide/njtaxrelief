# Watchdog Intelligence Production Manifest

This file is the production allowlist for Watchdog Intelligence. It is intentionally narrower than staging.

Production must never be created by bulk-copying staging functions, test users, staging fixtures, or staging secrets.

## Release candidate

- Assessment Anomaly current candidate: **v5 / calibrated preview**
- Population worker: `watchdog-population-worker-v3-governed-assessment-features`
- Calibration admin: `watchdog-calibration-admin-v2-negative-insufficient`
- Human calibration: 25 frozen evidence-first labels
- Assessment v5 calibration result:
  - precision: 87.50%
  - recall: 63.64%
  - false-positive rate: 16.67%
- Human `Uncertain` labels remain outside binary precision/recall/FPR metrics.

A calibrated preview is not automatically customer-live. Customer visibility remains a separate launch decision.

## Production Edge Function allowlist

The auth settings below must match `supabase/config.toml` at promotion time.

### JWT required

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

### Custom authentication

`intelligence-job-worker` is the only production-eligible Intelligence function with gateway `verify_jwt=false`.

The worker is not a browser endpoint. It must authorize every request through one of its internal boundaries:

1. matching one-time worker token hash with a non-expired token, consumed on use;
2. production automation secret; or
3. authenticated developer JWT fallback verified inside the function.

Do not change this to an unauthenticated worker endpoint.

## Staging-only functions: never promote

Do not deploy staging self-test, bootstrap, debug, diagnostic, fixture, or account-creation helpers to production.

In particular, `intelligence-preview-review-user` is permanently disabled in staging with HTTP 410 and must not be promoted.

Any function matching a self-test/debug/bootstrap purpose requires an explicit separate review before it could ever be added to this allowlist.

## Production database baseline before promotion

The last read-only preflight confirmed production had:

- 0 public `intelligence_%` tables;
- 0 public/private Intelligence routines;
- 0 Intelligence Edge Functions.

This clean state is desirable. A future preflight must confirm it again immediately before promotion.

## Required extensions

Current production extension state at the last preflight:

- `supabase_vault`: installed;
- `pg_net`: not installed;
- `pg_cron`: not installed.

Install required extensions deliberately and verify them before any scheduler activation. Scheduler/recurring work remains disabled until the direct worker smoke test succeeds.

## Production-only secret names

Configure only when the corresponding runbook step is reached. Never copy staging values blindly.

Required for population worker/scheduler activation:

- `watchdog_intelligence_worker_url`
- `watchdog_intelligence_worker_token`

Optional Analyst prose provider configuration:

- `OPENAI_API_KEY`
- `WATCHDOG_ANALYST_MODEL`

The deterministic Analyst and governed model tools must remain usable without the optional prose provider.

## Migration rules

Apply repository migrations in version order and stop on any error.

Every migration filename must have a unique timestamp version. The release-candidate audit corrected the two duplicate Intelligence versions before production:

- Property Change v3: `20260817072100_watchdog_intelligence_property_change_v3.sql`
- Phase 6 team lineage: `20260817074100_watchdog_intelligence_phase6_team_run_lineage.sql`

Do not reintroduce the former duplicate `072000` or `074000` variants.

The Assessment v5 governed configuration is carried by:

- `20260817175500_watchdog_intelligence_assessment_v5_calibrated_review_window.sql`

Human calibration rows are staging audit evidence and are intentionally not seeded into production migrations.

## Model and worker parity

Assessment property-level and population-level scoring must both consume the pinned model version's governed feature definitions.

Worker v3 must not regress to hardcoded values for:

- sale eligibility window;
- sale-recency confidence;
- cohort minimum sample size;
- cohort fallback chain;
- tax-rate winsorization.

For Assessment v5 specifically, the governed assessment-to-sale review window allows plausible sales through eight years while sale-recency confidence continues to decay independently.

Historical model versions remain immutable so prior runs can be reproduced and rollback remains possible.

## Production promotion sequence

1. Complete authenticated hosted desktop/mobile release-candidate acceptance.
2. Reconfirm branch is synchronized with `main` and review the final diff.
3. Capture a fresh production schema, extension, function, advisor, and entitlement baseline.
4. Confirm rollback/stop controls.
5. Install required extensions deliberately.
6. Apply ordered migrations.
7. Verify schema, RLS, triggers, functions, model registry, and current model pointer before deploying browser-facing code.
8. Configure production-only secrets deliberately.
9. Deploy only the Edge Functions in this allowlist with the pinned auth settings.
10. Keep scheduler/recurring work disabled.
11. Smoke Standard, Pro, Pro+, Teams, and developer entitlements.
12. Smoke Semantic Context, Assessment, Closing, Change, deterministic Analyst, scenarios, Daily Intelligence, Teams, and Operations.
13. Compare security/performance advisor results with the pre-promotion baseline and investigate new warnings.
14. Direct-smoke the population worker before adding worker URL/token scheduler secrets.
15. Run one controlled scheduler acceptance and prove the stop path.
16. Perform the rollback drill.
17. Enable calibrated customer visibility last.

**Merged does not mean launched.**

## Rollback principle

Rollback must be fail-closed and non-destructive:

- disable customer visibility;
- disable recurring dispatch;
- disable or roll back Edge Functions/current-model pointer as appropriate;
- preserve governed evidence, audit, calibration, and historical model-version records unless a separately reviewed data-removal action is required.
