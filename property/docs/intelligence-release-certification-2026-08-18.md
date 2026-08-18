# Watchdog Intelligence release certification — August 18, 2026

This document records staging-only runtime evidence for the Watchdog Intelligence release candidate. It does not authorize production promotion, enable customer visibility, or change Stripe/billing configuration.

## Scope

Certified on isolated Supabase staging project `pxossnwmrygxlpxtstnl` against PR #63 (`feature/watchdog-intelligence-foundation`). Production project `uvkvaxljhhngydvlrzom` remained untouched.

The temporary data and helper used for destructive/failure-path certification were removed or disabled after evidence capture.

## 1. Watchdog Analyst deterministic fallback

### Result: PASSED

The deployed staging `intelligence-analyst` was exercised through a real authenticated Pro staging user created only for certification.

Staging currently has no optional prose-provider API key configured. That means the real deployed Analyst is naturally operating in its provider-unavailable mode, which is the exact failure state the launch gate requires us to tolerate.

Two equivalent Analyst requests were executed against property `0818_109.06_20` and the assessment context.

Observed result:

- HTTP 200 on both requests.
- `provider_status = provider_unavailable` on both requests.
- deterministic status remained `complete`.
- approved tool selected: `property_facts`.
- 18 governed evidence items returned.
- stable governed payload was identical across both requests when volatile cache metadata was excluded.
- stable governed-payload SHA-256: `0321304da6a025b55c06d16a6d6c33fb510be5689d7a550018f0d6eef57b8795`.
- 2 Analyst sessions persisted during the test.
- 4 messages persisted.
- 2 completed tool-call records persisted.
- 2 Analyst usage events persisted.
- both assistant messages reached `complete`.

The certification user, entitlement, sessions, messages, tool calls and usage events were deleted after the evidence was captured.

A temporary staging-only `intelligence-analyst-certification` helper was redeployed to HTTP 410 after the run so it cannot be reused as an active test surface.

### Important limitation

The optional online prose-provider rewrite was **not dynamically certified** because staging has no prose-provider key. Source review confirms the provider layer is downstream of the deterministic response and is restricted to rewriting conclusion/caveats, but this certification makes no claim that an online provider was exercised.

The release property proven here is stronger and launch-critical: **Watchdog Intelligence remains useful, evidence-backed and auditable when the prose provider is completely unavailable.**

## 2. Population worker, scheduler and rollback/stop controls

### Result: PASSED

The real staging scheduler/worker path was exercised using the configured `watchdog_intelligence_worker_url` Vault entry and one-time worker-token dispatch.

### Scheduled happy path

A temporary Pro+ scheduled scope containing two known staging properties was made due.

The real private cron dispatcher:

- enqueued exactly 1 job;
- dispatched exactly 1 job server-side;
- the population worker processed 2/2 properties;
- created 2 governed findings;
- created the corresponding Intelligence run;
- created a ready Daily Intelligence digest;
- completed with 0 retries and no error.

Certification job: `b8719223-5805-42db-bb9b-b882c5132f45`.
Certification run: `1662a792-e7bc-4d2b-b90e-e0b0830c96ab`.

### Idempotency

The same scheduled scope was made due again on the same day. The dispatcher returned 0 enqueued / 0 dispatched. No duplicate job was created.

### Retry and terminal failure

A controlled job used an unsupported population model to force the worker's real exception path.

Certification job: `5eaeb293-d422-43d5-9f1d-d1408ac51084`.

Observed sequence:

1. attempt 1 → `partial`, retry count 1, retry scheduled;
2. attempt 2 → `partial`, retry count 2, retry scheduled;
3. attempt 3 → terminal `failed`, retry count 3;
4. `completed_at` populated;
5. worker lock, worker identity and one-time worker-token fields cleared.

The event ledger recorded running/retry transitions and final failure rather than silently dropping the job.

An initial attempt to create a test job with `batch_size=1` was rejected by the database queue constraint. The certification was rerun using the supported minimum batch contract rather than bypassing that guard.

### Stale-lock recovery

A deliberately stale `running` job was created with an 11-minute-old lock. `claim_intelligence_job()` reclaimed it after the configured 10-minute timeout:

- exact stale job reclaimed;
- retry count incremented once;
- worker ownership reassigned;
- lock timestamp refreshed.

Certification job: `3f187892-cf10-4ab4-85ac-4d98f2d11330`.

The job was then canceled and its lock cleared.

### Stop controls

Per-scope stop was verified by setting the certification scope inactive and unscheduled while it was otherwise due. The dispatcher returned 0 enqueued / 0 dispatched.

Global emergency stop was verified with the real cron record:

- cron job `watchdog-intelligence-dispatch` was deactivated;
- inactive state was confirmed;
- it was immediately reactivated;
- its original schedule and command were preserved.

### Cleanup

All temporary certification artifacts were deleted:

- jobs;
- job events;
- runs;
- findings;
- run-cache entries;
- Daily Intelligence digest;
- population usage events;
- temporary scheduled scope.

Final verification returned 0 certification jobs, 0 certification scopes and 0 certification runs.

## 3. Production promotion packaging

The authoritative machine-readable Gate 5 package is:

`supabase/intelligence-production-manifest.json`

The human runbook is:

`property/docs/intelligence-production-promotion-manifest.md`

A CI contract validates that the manifest references real source-controlled migrations/functions, matches `supabase/config.toml`, excludes staging/diagnostic helpers, preserves the newer production entitlement contract through reconciliation rather than blind reapplication, and contains explicit authorization/rollback/customer-visibility-last guards.

## Certification conclusion

- Deterministic Analyst without an LLM/prose provider: **PASS**.
- Analyst persistence and tool/evidence lineage: **PASS**.
- Scheduled population happy path: **PASS**.
- Same-day scheduling idempotency: **PASS**.
- Retry/backoff/terminal failure: **PASS**.
- Stale-lock recovery: **PASS**.
- Per-scope stop: **PASS**.
- Global cron stop/restore: **PASS**.
- Staging cleanup: **PASS**.
- Production changed: **NO**.
- Stripe/billing changed by this certification: **NO**.

This evidence advances production readiness but does not close NJW-209. Actual Gate 5 production promotion still requires the external prerequisites and explicit production authorization recorded in the production manifest.
