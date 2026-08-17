# Watchdog Intelligence Phase 6 Promotion and Rollback Runbook

## Purpose

Phase 6 scales Watchdog Intelligence into browser-independent population analysis, saved and scheduled scopes, Daily Intelligence, Teams workspaces, usage limits, caching, observability and production hardening.

This runbook is intentionally conservative. Deterministic Watchdog Intelligence must remain usable if an LLM provider is unavailable, and historical findings must remain immutable/auditable during rollback.

## Staging acceptance evidence

Validated on the Watchdog NJW-42 staging project on August 17, 2026:

- 520-property population run completed through resumable server-side batches: 200 -> 400 -> 520 processed.
- The run used one immutable run ID, completed with zero retries, and the Teams `max_findings_per_run` cap retained exactly 500 findings.
- An unchanged rerun produced a cache hit and reused the original governed run instead of recomputing.
- A changed trusted fact produced a new facts fingerprint, a new immutable run and a Daily Intelligence delta rather than mutating history.
- Daily Intelligence correctly identified a materially strengthened finding after the controlled fact change.
- Supabase Cron executed the dispatcher without browser involvement, created a `scheduled` job, completed the worker run, advanced `next_run_at`, and wrote a digest.
- Team/org RLS allowed an explicit member to read 8 shared findings while an outsider read 0.
- A future sale-year fixture was quarantined at the trusted finding boundary. Sale-ratio and sale-recency evidence were removed, missing evidence was recorded as `invalid_future_sale_year`, and the result was recomputed from valid remaining evidence.
- Worker retry recovery completed without duplicate trusted findings. Successful terminal states clear stale error fields.
- Population finding limits and job quotas are enforced at server/database boundaries, not only in UI code.
- Intelligence-specific SECURITY DEFINER helpers were moved behind non-exposed/private boundaries or made invoker-only where appropriate.
- Phase 4/5 acceptance also verified deterministic Analyst fallback during provider unavailability, action lineage and the personalized-learning activation boundary.

Synthetic 520-property fixtures were deleted after the acceptance run. Acceptance facts are retained in Linear and this runbook rather than leaving fake customer data in staging.

## Environment-specific configuration

The recurring dispatcher must never hardcode a Supabase project URL in a migration.

Each environment must store its own full Intelligence worker URL in Supabase Vault under:

`watchdog_intelligence_worker_url`

Example shape only:

`https://<project-ref>.supabase.co/functions/v1/intelligence-job-worker`

The scheduled Cron command calls `private.watchdog_dispatch_intelligence_cron(5)`. If the Vault value is absent, the wrapper remains fail-closed/disabled instead of calling another environment.

## Production promotion gates

Do not promote customer-facing Intelligence until all applicable gates are green:

1. Phase 2 human calibration and model-promotion criteria are satisfied for each model being exposed.
2. Phase 3, Phase 4 and Phase 5 acceptance remain green against the release candidate.
3. Production Vault contains the production `watchdog_intelligence_worker_url` value.
4. Production plan limits are reviewed before population jobs are enabled.
5. Supabase security and performance advisors are reviewed after migrations.
6. Team/org RLS is re-tested with owner/member/viewer/outsider identities.
7. A small production smoke scope completes from submit -> queue -> worker -> finding -> digest.
8. Cron has one active `watchdog-intelligence-dispatch` job and its run history shows success.
9. Deterministic Intelligence is tested with the LLM provider intentionally unavailable.
10. Existing platform release gates, billing acceptance and continuity/restore requirements are not bypassed by this feature launch.

## Promotion sequence

1. Merge the reviewed Intelligence feature branch.
2. Apply database migrations and verify migration history.
3. Deploy the pinned Intelligence Edge Functions.
4. Configure the production Vault worker URL.
5. Confirm the Cron job is active and points only to the private Vault-backed wrapper.
6. Run security and performance advisors.
7. Run a small developer-only production acceptance scope.
8. Verify no cross-user or cross-organization access.
9. Verify job, cache, digest and usage telemetry in Intelligence Operations.
10. Enable customer visibility only for models/plans that have passed calibration and release gates.

## Rollback procedure

Rollback is fail-closed and non-destructive.

1. Stop new scheduled work by unscheduling or disabling the `watchdog-intelligence-dispatch` Cron job.
2. Remove/disable the environment-specific Vault worker URL if an immediate worker stop is required.
3. Prevent new population submissions at the API/plan gate while allowing existing historical runs/findings to remain readable for audit.
4. Redeploy the previous known-good Edge Function versions if a worker/API regression caused the incident.
5. Move affected Intelligence model versions back to preview/deprecated state rather than rewriting historical findings.
6. Do not delete historical runs, evidence, facts hashes, outcomes or source lineage as part of normal rollback.
7. If a schema fix is required, use a forward corrective migration rather than editing production migration history.
8. Re-run security/performance advisors and the smallest deterministic smoke test before re-enabling Cron or submissions.

## Fail-soft behavior

- Population scoring, caching, Daily Intelligence, plan enforcement and governed findings do not depend on OpenAI.
- If the Analyst provider is unavailable, governed deterministic results remain available and only narrative/conversational enhancement degrades.
- Missing or invalid evidence must remain missing/invalid. The system must not substitute generated facts.

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

Provider cost must not be invented. Cost should remain unavailable until a versioned pricing record exists.
