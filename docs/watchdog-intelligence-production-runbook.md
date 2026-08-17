# Watchdog Intelligence production runbook

This runbook promotes the staged Watchdog Intelligence stack without changing the evidence contract or silently changing model behavior.

## Promotion order

1. Apply the Intelligence migrations in timestamp order. The Phase 6 migrations are additive and create population jobs, cache, digests, organization boundaries, worker claiming, browser-independent dispatch, and team run lineage.
2. Deploy the governed Edge Functions before exposing the new UI:
   - `intelligence-normalize-preview`
   - `intelligence-score-preview`
   - `intelligence-assessment-run-preview`
   - `intelligence-closing-run-preview`
   - `intelligence-change-run-preview`
   - `intelligence-workbench-view-preview`
   - `intelligence-property-context`
   - `intelligence-analyst`
   - `intelligence-learning`
   - `intelligence-job-submit`
   - `intelligence-job-worker`
   - `intelligence-team`
   - `intelligence-team-job-submit`
   - `intelligence-operations-admin`
3. Keep `intelligence-job-worker` with JWT verification disabled only because the function performs its own authorization. It accepts a short-lived one-time job token, the existing Watchdog automation secret, or a developer JWT. All other customer-facing Intelligence functions require JWT verification.
4. Configure `OPENAI_API_KEY` only if AI prose is being enabled. Watchdog Analyst remains functional in deterministic mode when this key is absent. Configure `WATCHDOG_ANALYST_MODEL` to a supported model only after verifying the API model name and pricing. Do not infer provider cost when there is no versioned pricing record.
5. Configure a high-entropy `WATCHDOG_AUTOMATION_SECRET` for manual operational use. Scheduled population dispatch does not place this secret in SQL or browser code.
6. Schedule browser-independent population dispatch in production with `pg_cron` and the production Supabase function URL. Example:

```sql
select cron.schedule(
  'watchdog-intelligence-production-dispatch',
  '*/10 * * * *',
  $$select public.dispatch_due_intelligence(
    'https://YOUR_PRODUCTION_PROJECT.supabase.co/functions/v1/intelligence-job-worker',
    5
  );$$
);
```

`dispatch_due_intelligence` generates a one-time worker token, stores only its SHA-256 hash, expires it after five minutes, and sends the raw token directly to the worker through `pg_net`.

7. Deploy the stable frontend asset paths. Do not add `?v=` cache-busting parameters or versioned copies of Watchdog JavaScript/CSS files.
8. Verify the developer Operations page before opening the feature to customers. A promotion is blocked if the model version, evidence coverage, failure rate, schedule health, or source lineage cannot be inspected.

## Plan boundaries

- Pro: property-level Assessment Intelligence, Watchdog Analyst, Opportunity Value and outcome learning.
- Pro+: browser-independent population jobs, saved/scheduled Intelligence scopes, Change Intelligence and Daily Intelligence.
- Teams: explicit organization membership, shared population scopes/runs/findings, and role-based read/write boundaries.
- Developer: model calibration, operations, diagnostics and worker controls.

The database remains the enforcement boundary. Frontend plan labels are not trusted authorization.

## Daily Intelligence behavior

A scheduled scope resolves its governed property population on the server. The job pins the model version and scope fingerprint, processes the population in resumable batches, records job events, and writes a completed immutable run. A facts fingerprint and model/version key are used for caching. If the governed facts are unchanged, the prior run is reused and the digest records that no material change occurred. The browser is not part of this execution path.

Daily digests compare the current run with the previous run for the same monitored scope/model and separate:

- new findings
- strengthened findings
- weakened findings
- removed findings
- missing-evidence changes
- the current recommended review queue

These are review-priority changes, not predictions that an owner will transact.

## Teams boundary

Team sharing is explicit. A user is not placed into a team based on brokerage, email domain, CRM identity, property ownership, or any inferred relationship. Shared scopes, jobs, caches, digests, runs and findings carry an `organization_id`. RLS permits reading shared Intelligence only when the current authenticated user is an explicit organization member. Viewer roles cannot submit shared jobs.

## AI boundary

The LLM is optional prose and orchestration. It never receives raw database credentials and it never writes SQL. Approved Watchdog tools perform the factual operations. Deterministic output is available if the provider is unavailable. Stateful Watchdog tool calls are not automatically retried. The optional provider prose call has one bounded retry for transient transport/429/5xx failures.

The Analyst refuses protected-class housing targeting, inferred seller intent or personal distress, and guarantees. User-entered financial assumptions remain labeled as scenarios and do not change Watchdog scores or facts.

## Monitoring gates

Before customer rollout, verify at minimum:

- no new Supabase security-advisor errors from Intelligence objects
- population job failure rate is acceptable for the staged workload
- no stale running jobs beyond the worker lease threshold
- P95 population completion time is within the product target for representative scopes
- evidence coverage is visible and limited-evidence findings remain labeled
- Analyst token usage and provider status are visible
- provider cost is shown only when an explicit versioned cost record exists
- scheduled scopes advance `next_run_at` after both computed runs and cache hits
- organization members can read shared runs/findings and non-members cannot
- model/version/facts lineage remains queryable after downstream Case, Report, Watchlist and value/outcome actions

## Rollback

1. Unschedule the production dispatcher:

```sql
select cron.unschedule('watchdog-intelligence-production-dispatch');
```

2. Pause scheduled scopes without deleting their history:

```sql
update public.intelligence_scopes
set is_scheduled=false, next_run_at=null, updated_at=now()
where is_scheduled=true;
```

3. Mark queued/partial jobs canceled if they should not resume. Do not delete completed runs, findings, outcome events, feedback, evidence batches, or value snapshots.
4. Revert the frontend deployment to remove customer entry points.
5. If a model is the problem, demote the affected model/version in the governed registry rather than rewriting historical findings. Historical findings keep their pinned model version and facts hash.
6. Leave additive tables in place unless a later reviewed migration removes them. Dropping audit/history tables is not part of an emergency frontend rollback.

## Production acceptance record

Record the deployed Git commit, Supabase migration versions, Edge Function versions, model/version states, cron job ID, representative population benchmark, security-advisor result, and the reviewer who approved production promotion. This creates a reproducible boundary between staging acceptance and customer rollout.
