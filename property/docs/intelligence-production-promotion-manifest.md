# Watchdog Intelligence Gate 5 production promotion manifest

This is the human-readable companion to `supabase/intelligence-production-manifest.json`. The JSON file is authoritative for source-controlled migration/function allowlists and is validated by CI.

## Hard boundary

**Do not execute this promotion without explicit production authorization.**

A merged PR is not a launch. Customer visibility is the final action, after migrations, functions, roles, deterministic runtime, scheduler controls, advisors and rollback checks pass.

This runbook does not configure, charge, refund, test or otherwise mutate Stripe. The separate Live billing gate must already be satisfied before broad paid launch.

## Gate A — freeze the exact release

1. Freeze the exact PR #63 head.
2. Reconcile the feature branch against the current `main`.
3. Run all registered PR CI against that frozen head.
4. Verify the machine manifest contract passes.
5. Record the frozen SHA in Linear and in the release evidence.
6. Confirm production Intelligence has not been partially promoted outside this runbook. If it has, reconcile actual state before continuing.

## Gate B — external prerequisites

All of the following must be true before production mutation begins:

- separate controlled Live billing lifecycle gate passed;
- Supabase Auth leaked-password protection enabled and advisor warning cleared;
- counsel, insurance and data-rights launch items documented;
- external uptime alert owner/channel assigned;
- current isolated restore/backup checkpoint available;
- rollback owner identified;
- customer-facing Intelligence remains disabled.

## Gate C — protect the newer production entitlement contract

Production has entitlement/helper changes that are newer than some release-branch compatibility migrations. Do **not** overwrite those objects simply because the branch contains an older migration filename.

Before applying Intelligence SQL:

1. inspect current production `get_my_entitlement()`;
2. inspect current production `has_watchdog_plan(text)`;
3. prove the commercial order remains Standard → Agent → Pro → Pro+ → Teams, with Developer separate;
4. preserve newer production entitlement/security-helper definitions;
5. treat these branch migrations as reconciliation references, not automatic apply steps:
   - `20260818213000_watchdog_full_tier_entitlement_contract.sql`
   - `20260818214500_watchdog_standard_entitlement_access_fix.sql`.

The two narrow, newly certified plan RLS migrations **are** part of the apply list after the Intelligence organization/workbench tables exist:

- `20260818221624_watchdog_teams_org_plan_boundary.sql`
- `20260818221753_watchdog_agent_workbench_plan_boundary.sql`.

## Gate D — apply database migrations in exact manifest order

Use `migrations.apply_in_order` from `supabase/intelligence-production-manifest.json` as the only allowlist.

Rules:

- apply in listed order;
- stop on the first unexpected error;
- do not bulk-apply staging-only migration history;
- do not infer missing migrations from the staging database;
- do not apply any SQL not source-controlled on the frozen release head;
- do not reapply the two reconciliation-only entitlement migrations unless an explicit object-level review determines they are still needed and safe against the newer production definitions.

After SQL completes, verify:

- expected Intelligence tables/functions exist;
- RLS is enabled where designed;
- organization workspace requires Teams;
- Data Workbench saved-view ownership also requires Agent+;
- Data Center remains Pro+;
- no anonymous entitlement escalation is possible;
- no staging fixtures/test accounts were introduced.

## Gate E — deploy only allowlisted Edge Functions

Deploy exactly the 23 functions in `edge_functions.deploy_allowlist` from the machine manifest, using the `verify_jwt` value already pinned in `supabase/config.toml`.

Never bulk-promote staging. The manifest explicitly excludes preview-review/account helpers, self-tests, smoke/finaltest helpers, recalibration helpers and the temporary Analyst certification function.

The population worker deliberately uses `verify_jwt = false` at the gateway because it performs its own one-time worker-token/developer/optional automation authorization. This exception is source-controlled and must not be generalized to other Intelligence functions.

## Gate F — configure the worker fail closed

The scheduler reads the Vault entry:

`watchdog_intelligence_worker_url`

Until that value exists, recurring Intelligence remains disabled/fail-closed.

When controlled production worker activation is authorized, set the value to:

`https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/intelligence-job-worker`

Scheduled dispatch uses a newly generated one-time worker token stored only as a hash with a five-minute expiry. It does not require a permanent browser credential.

Optional Analyst prose configuration is not a launch requirement. `OPENAI_API_KEY` and `WATCHDOG_ANALYST_MODEL`, if configured, affect only the bounded prose rewrite. Deterministic governed Intelligence must pass with those absent.

## Gate G — authenticated plan smoke matrix

Run real authenticated acceptance for every commercial tier.

### Standard

- baseline property facts work;
- Agent Data Workbench saved-view write denied;
- Pro Intelligence denied where required;
- Pro+ Data Center denied;
- Teams organization write denied.

### Agent

- Data Workbench saved-view write allowed;
- Pro Intelligence denied where required;
- Pro+ Data Center denied;
- Teams organization write denied.

### Pro

- Agent workbench allowed;
- property-level Intelligence and Watchdog Analyst allowed;
- Pro+ population/Data Center denied;
- Teams organization write denied.

### Pro+

- property-level Intelligence allowed;
- Data Center allowed;
- population Intelligence allowed;
- Teams organization write denied.

### Teams

- Agent, Pro and Pro+ capabilities allowed;
- organization/team workspace CRUD allowed.

### Developer

- developer operational bypass remains explicit and audited;
- customer tiers must never inherit Developer privileges.

## Gate H — deterministic runtime smoke

Before scheduling recurring jobs or enabling customer visibility:

1. run a property-level Assessment Anomaly request;
2. open Evidence and prove source/derived/missing-evidence lineage;
3. run Watchdog Analyst and record tool call + evidence + session/message/usage persistence;
4. accept either online prose or `provider_unavailable`, but the governed answer must remain complete in both cases;
5. run one deterministic scenario and verify explicit assumptions;
6. run page-native context from Dashboard/Home against the same governed source contract.

The August 18 staging certification already proved the real Analyst remains complete with 18 evidence items and identical stable governed payload when the prose provider is absent. Production must still receive a post-deploy smoke.

## Gate I — controlled population canary

Keep broad scheduler/customer visibility off.

1. create one controlled Pro+ scope with a very small known property set;
2. dispatch one job;
3. verify queue → worker → run → finding → Daily Intelligence lineage;
4. verify candidate/processed counts reconcile;
5. run the same scheduled scope/day again and verify no duplicate job;
6. force one controlled retryable/terminal failure path if production safety policy permits; otherwise rely on the accepted staging failure certification and verify only non-destructive status/lock behavior in production;
7. verify stale locks remain reclaimable;
8. verify one-time worker-token fields are cleared on completion/failure;
9. remove the canary data if it is not intended to persist.

## Gate J — stop/rollback acceptance

Before activating recurring delivery, prove the operator can stop it.

Primary stop order:

1. keep or return customer visibility to off;
2. deactivate the `watchdog-intelligence-dispatch` cron job;
3. disable scheduled scopes if the queue must remain frozen;
4. remove/disable `watchdog_intelligence_worker_url` if recurring dispatch must fail closed;
5. cancel only queued/running rollout jobs, preserving completed audit evidence;
6. redeploy the last accepted Edge Function versions if a function regression occurred;
7. prefer additive forward-fix schema reconciliation over destructive down-migrations;
8. use the isolated restore checkpoint only for a true data-integrity incident.

The August 18 staging certification proved both per-scope stop and global cron deactivate/restore behavior.

## Gate K — post-promotion review

Run and record:

- Supabase security advisor;
- Supabase performance advisor;
- authenticated access-boundary suite;
- hosted desktop/mobile acceptance;
- public uptime checks;
- deterministic Analyst-without-provider behavior;
- worker idle behavior with no due jobs;
- scheduler state and next execution;
- no certification/test residue;
- no anonymous access regression.

Review advisor **delta** rather than trying to mechanically reach zero warnings. Existing intentional closed service tables and reviewed SECURITY DEFINER boundaries must not be opened merely to silence a lint.

## Gate L — customer visibility last

Only after every prior gate passes and explicit launch authorization is given:

1. enable intended customer-facing Intelligence entry points;
2. keep Teams self-service availability aligned with commercial launch policy;
3. observe uptime/errors/job queue closely during the controlled launch window;
4. preserve stop controls and rollback ownership.

## Accepted pre-production evidence

See `property/docs/intelligence-release-certification-2026-08-18.md` for the completed staging evidence covering:

- deterministic Analyst with prose provider unavailable;
- Analyst persistence/tool lineage;
- worker happy path;
- same-day job idempotency;
- retry/backoff/terminal failure;
- stale-lock recovery;
- per-scope stop;
- global cron stop/restore;
- cleanup to zero certification residue.

That evidence makes this promotion repeatable. It does **not** constitute production authorization.
