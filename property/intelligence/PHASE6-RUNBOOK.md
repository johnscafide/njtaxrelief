# Watchdog Intelligence Production Promotion and Rollback Runbook

## Purpose

This runbook governs promotion of the complete Watchdog Intelligence release candidate, including the Phase 6 population/Daily/Teams infrastructure, Phase 7 page-native operating layer and Phase 8 governed Semantic Snapshot/Analyst scenario layer.

The release is intentionally conservative. Deterministic Watchdog Intelligence must remain usable if an LLM provider is unavailable, source truth must remain auditable, and historical findings/outcomes must remain immutable during rollback.

Production remains untouched until the launch gates below pass.

## Staging acceptance evidence

Validated on the dedicated Watchdog NJW-42 staging project on August 17, 2026:

### Population / Daily / Teams

- 520-property population run completed through resumable server-side batches: 200 -> 400 -> 520 processed.
- The run used one immutable run ID, completed with zero retries, and the Teams `max_findings_per_run` cap retained exactly 500 findings.
- An unchanged rerun produced a cache hit and reused the original governed run instead of recomputing.
- A changed trusted fact produced a new facts fingerprint, a new immutable run and a Daily Intelligence delta rather than mutating history.
- Daily Intelligence correctly identified a materially strengthened finding after the controlled fact change.
- Supabase Cron executed the dispatcher without browser involvement, created a `scheduled` job, completed the worker run, advanced `next_run_at`, and wrote a digest.
- Team/org RLS allowed an explicit member to read 8 shared findings while an outsider read 0.
- Worker retry recovery completed without duplicate trusted findings. Successful terminal states clear stale error fields.
- Population finding limits and job quotas are enforced at server/database boundaries, not only in UI code.

### Source truth / finding persistence

- Future sale-year defense remains at the trusted finding boundary.
- The Assessment date-sanity trigger now validates actual governed `property_lookups.last_sale_year`; it does not interpret `watchdog.sale_recency_confidence.value` (years since sale) as a calendar year.
- Unexpected date-guard errors raise visibly rather than silently deleting otherwise valid findings.
- Known Assessment fixture `0117_10102_5` persists a score of 81.14 with its facts hash and finding/run lineage intact.
- Semantic Snapshot preserves competing governed observations, selects the canonical observation by published source-authority policy, and keeps alternatives in lineage.

### Page-native Intelligence / feedback

- Dashboard portfolio, Dashboard Compare, Property Report, Agent Control and Data Workbench publish authoritative governed page contexts.
- Explicit page context overrides DOM inference for the focused property/scope/model set.
- Context Suggestions preserve persisted finding/run lineage.
- Exposure, open, Useful, Not relevant and Dismissed events were accepted in staging.
- Context feedback uses zero request units and therefore does not consume model/Analyst quotas.
- Useful/Not relevant/Dismissed reuse immutable Phase 5 outcome/learning contracts.
- Feedback did not change the original score, confidence, evidence coverage or facts hash.
- A spoofed browser suggestion identifier was rejected with canonical lineage re-derived server-side.

### Semantic Snapshot / Analyst

- Semantic Snapshot v5 supports both small named semantic packs and bounded direct requests for current live/partial governed marker IDs.
- Direct marker requests do not silently load default packs.
- Unknown/planned/unavailable markers remain explicit; no value is invented.
- Semantic cache is user/plan/property/request scoped and facts hashes remain stable across cache hits and forced refreshes when source facts do not change.
- Deterministic property-tax scenarios require all three financial assumptions and do not use an LLM for math or assumption filling.
- Ask Watchdog scenario orchestration records Analyst session/message/tool/usage lineage while provider status remains `not_called` for the deterministic calculation.
- Staging Analyst provider unavailability degrades prose only; governed facts, model runners and deterministic tools remain operational.

Temporary synthetic/selftest users and fixtures were cleaned where the platform allowed it. One separately tracked staging-only score-history test row remains tagged `home-history-selftest-20260817` because the execution safety layer blocked its deletion. It is tracked in Linear NJW-210 and is not production data.

## Human calibration gate

Assessment Anomaly v4 must not be promoted as calibrated merely because engineering is complete.

Required before customer-facing calibrated status:

- at least 25 genuine human-reviewed calibration cases
- precision >= 0.70
- recall >= 0.60
- false-positive rate <= 0.30
- no synthetic or agent-fabricated human labels

The calibration console is evidence-first: governed source facts are reviewed before model evidence and the human label controls. The model score is context, not the answer key.

## Environment-specific configuration

### Worker URL

The recurring dispatcher must never hardcode a Supabase project URL in a migration.

Each environment stores its own full Intelligence worker URL in Supabase Vault under:

`watchdog_intelligence_worker_url`

Example shape only:

`https://<project-ref>.supabase.co/functions/v1/intelligence-job-worker`

The scheduled Cron command calls `private.watchdog_dispatch_intelligence_cron(5)`. If the Vault value is absent, the wrapper remains fail-closed/disabled instead of calling another environment.

### Worker token / provider configuration

Production-only worker tokens, OpenAI/API secrets and model-selection configuration must be created intentionally for production. Do not copy staging secret values blindly.

If the optional Analyst provider is not configured at launch, launch may proceed only if the product is intentionally accepted in deterministic-only Analyst mode and that state is visible/understood. Provider absence must not affect deterministic facts/models/scenarios.

## Read-only production preflight baseline — August 17, 2026

Production project: `uvkvaxljhhngydvlrzom`.

Before Intelligence promotion:

- 0 public tables matching `intelligence_%`
- 0 public/private Intelligence routines
- no `intelligence_semantic_snapshot_cache`
- no `intelligence_jobs`
- no `intelligence_calibration_sets`
- no `intelligence-*` Edge Functions deployed

Therefore production currently has a clean install path rather than a partially promoted Intelligence environment.

### Extensions

At preflight:

- `pg_net` is installed
- `pg_cron` is not installed
- Vault extension is not installed

Install only the extensions actually required by the reviewed migrations. Recurring work must remain disabled/fail-closed until direct production smoke acceptance passes.

### Secret-name baseline

The following Watchdog Intelligence/provider secret names were not present at preflight:

- `watchdog_intelligence_worker_url`
- `watchdog_intelligence_worker_token`
- `OPENAI_API_KEY`
- `WATCHDOG_ANALYST_MODEL`

Only secret names were checked. Secret values were not requested or exposed.

### Existing entitlement contract

Production already has the account/profile fields and entitlement RPCs used by the staging access-control design:

- `get_my_entitlement()`
- `has_watchdog_plan(required_plan text)`
- `is_watchdog_developer()`

No Intelligence-specific billing redesign is required merely to promote the feature. Production smoke must still verify Standard / Pro / Pro+ / Teams / developer boundaries and accounts with incomplete profile-role fields.

### Production security-advisor baseline

Pre-existing notices include:

- RLS-enabled/no-policy INFO notices on several existing/internal tables.
- SECURITY DEFINER WARN notices for signed-in execution of `get_my_entitlement()` and `has_watchdog_plan(required_plan text)`.
- Leaked-password protection disabled in production Auth.

These existed before Intelligence promotion. Post-promotion advisor review must compare against this baseline and investigate any new warning rather than attributing pre-existing notices to the Intelligence release.

## Production promotion gates

Do not expose customer-facing Intelligence until all applicable gates are green:

1. Human Assessment calibration satisfies the configured minimum review/precision/recall/FPR gates.
2. A current hosted release candidate passes authenticated desktop and mobile acceptance across the primary Intelligence surfaces.
3. Phase 7 and Phase 8 engineering acceptance remains green against that exact release candidate.
4. The feature branch is synchronized/reviewed against current `main` in a real git checkout. Do not invent an ahead/behind count when repository compare tooling is unavailable.
5. Production baseline snapshots/counts and rollback stop controls are recorded.
6. Required production extensions are installed without enabling recurring work prematurely.
7. Database migrations and Edge Functions are verified before customer visibility changes.
8. Production-only secrets/config are configured deliberately.
9. Production plan limits/entitlements are reviewed before population jobs are enabled.
10. Security and performance advisor deltas are reviewed after migrations/functions.
11. Team/org RLS is re-tested with owner/member/viewer/outsider identities.
12. A small developer-only production smoke scope completes through submit -> queue -> worker -> finding -> digest.
13. Semantic Snapshot, Assessment, Closing, Change, Analyst deterministic mode, scenarios, Daily, Teams and Operations are smoke-tested.
14. Deterministic Intelligence is tested with the optional LLM provider intentionally unavailable.
15. Cron/scheduled work is enabled only after direct worker acceptance and the stop/disable path has been verified.
16. Existing platform release gates, billing acceptance and continuity/restore requirements are not bypassed by this feature launch.

## Promotion sequence

The customer-visible merge/promotion is the last step, not the first.

1. Pass human calibration.
2. Pass current hosted desktop/mobile acceptance on the exact release candidate.
3. Synchronize/review the feature branch against current `main` in a real git checkout and resolve conflicts.
4. Record production preflight baselines and confirm rollback/stop controls.
5. Install required database extensions. Keep scheduler/worker intake disabled.
6. Apply Intelligence database migrations in repository order.
7. Verify migration history, tables, constraints, RLS, functions, triggers and fail-closed scheduler wrapper.
8. Configure production-only secrets/config. Do not enable recurring work yet.
9. Deploy the reviewed Intelligence Edge Functions with the intended JWT/auth settings.
10. Run security and performance advisors and compare to the pre-promotion baseline.
11. Run developer-only property-level smoke: Semantic Snapshot -> Assessment / Closing / Change -> finding lineage -> Analyst deterministic mode -> scenario.
12. Run plan/access smoke for Standard / Pro / Pro+ / Teams / developer.
13. Run Team/org owner/member/viewer/outsider RLS smoke.
14. Run one small population job manually/directly with recurring scheduler still disabled.
15. Verify job, cache, digest and usage telemetry in Intelligence Operations.
16. Configure/verify production worker URL/token and run one scheduled-dispatch acceptance.
17. Verify the scheduler stop/disable path immediately after that acceptance.
18. Enable recurring scheduled work only if the scheduled acceptance is clean.
19. Enable customer-visible models/plans only for calibrated/release-approved features.
20. Merge/finalize PR #63 and mark launch complete only after all launch gates are documented green.

If repository/deployment architecture requires the code merge before some production smoke steps, use a release configuration/visibility gate that keeps Intelligence inaccessible to customers until the remaining smoke gates pass. Do not equate “merged” with “launched.”

## Rollback procedure

Rollback is fail-closed and non-destructive.

1. Stop new scheduled work by unscheduling or disabling the `watchdog-intelligence-dispatch` Cron job.
2. Remove/disable the environment-specific Vault worker URL if an immediate worker stop is required.
3. Prevent new population submissions at the API/plan gate while allowing existing historical runs/findings to remain readable for audit.
4. Disable customer visibility for affected Intelligence features.
5. Redeploy the previous known-good Edge Function versions if a worker/API regression caused the incident.
6. Move affected Intelligence model versions back to preview/deprecated state rather than rewriting historical findings.
7. Do not delete historical runs, evidence, facts hashes, outcomes or source lineage as part of normal rollback.
8. If a schema fix is required, use a forward corrective migration rather than editing production migration history.
9. Re-run security/performance advisors and the smallest deterministic smoke test before re-enabling Cron, submissions or customer visibility.

## Fail-soft behavior

- Population scoring, caching, Daily Intelligence, plan enforcement, Semantic Snapshot, scenarios and governed findings do not depend on OpenAI.
- If the Analyst provider is unavailable, governed deterministic results remain available and only narrative/conversational enhancement degrades.
- Missing, invalid, planned or unavailable evidence remains missing/invalid/planned/unavailable. The system must not substitute generated facts.
- Feedback may adjust learned attention order only. It must never rewrite source facts, model scores, confidence, evidence coverage, facts hashes or historical findings.

## Operations checks

Developer Operations should expose at minimum:

- queued/running/partial/complete/cache-hit/failed job counts
- stale-running jobs and retry counts
- completion latency
- cache hit rate
- findings, average score, confidence and evidence coverage
- active/due scheduled scopes
- exact provider token usage when returned by the provider
- calibration/model-version state
- page-native suggestion exposure/open/useful/not-relevant/dismissed counts
- semantic cache/contract versions and conflict counts where operationally useful

Provider cost must not be invented. Cost should remain unavailable until a versioned pricing record exists.
