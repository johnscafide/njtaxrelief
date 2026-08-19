# Watchdog Intelligence Gate 5 production promotion manifest

This is the human-readable companion to `supabase/intelligence-production-manifest.json`. The JSON file is authoritative for the source-controlled migration/function allowlists and is validated by CI.

## Hard boundary

**Do not execute this promotion without explicit production authorization.**

A merged PR is not a launch. Customer visibility is the final action, after migrations, functions, roles, deterministic runtime, scheduler controls, advisors and rollback checks pass.

This runbook does not configure, charge, refund, test or otherwise mutate Stripe. Billing remains a separate commercial control plane.

There are two distinct readiness questions:

1. **Technical Intelligence promotion readiness:** whether the governed AI/Intelligence release can be safely promoted, smoke-tested and canaried in production while customer visibility and paid enrollment remain closed.
2. **Broad commercial/public launch readiness:** whether new paid enrollment and broad customer-facing launch should be opened.

A commercial gate may remain closed without making the Intelligence engineering release unsafe to promote privately. It must remain enforced until its own acceptance evidence exists.

## Gate A — freeze the exact release

1. Freeze the exact PR #63 head.
2. Reconcile the feature branch against the current `main`.
3. Run all registered PR CI against that frozen head.
4. Verify the machine manifest contract passes.
5. Record the frozen SHA in Linear and release evidence.
6. Confirm production Intelligence has not been partially promoted outside this runbook. If it has, reconcile actual state before continuing.

## Gate B — technical production prerequisites

All of the following must be true before Intelligence production mutation begins:

- PR #63 is frozen and current with `main`;
- production Intelligence is confirmed unpromoted, or any partial state is reconciled explicitly;
- customer-facing Intelligence remains disabled;
- the population scheduler remains fail-closed until its environment-local worker URL is intentionally configured;
- an isolated restore/backup checkpoint is available;
- a rollback owner is identified;
- the external uptime alert owner/channel is assigned.

### Commercial/public controls that remain separate

These do **not** substitute for the technical gates above and must not be silently bypassed:

- **Live billing lifecycle:** controlled Live purchase/change/cancel/failure/refund evidence is required before broad new paid enrollment. A non-public Intelligence promotion/canary may proceed only while paid enrollment remains closed and the billing gate stays enforced.
- **Supabase leaked-password protection:** the production organization is on the **Free plan**, where leaked-password protection is unavailable. NJW-35 records this as an accepted platform-plan limitation rather than an actionable defect. If Supabase is upgraded to Pro or above, enable leaked-password protection and rerun the security advisor before broad paid enrollment.
- **Counsel, insurance, entity/liability and data-rights review:** these are external business-governance gates for broad commercialization. Repository code cannot truthfully complete them.
- **Teams self-service:** remains commercially gated until separately authorized.

## Gate C — protect the current production entitlement contract

Production already contains current entitlement helper migrations. Do **not** overwrite those objects simply because the release branch contains compatibility-source migrations with different timestamps.

Before applying Intelligence SQL:

1. inspect current production `get_my_entitlement()`;
2. inspect current production `has_watchdog_plan(text)`;
3. prove the commercial order remains Standard → Agent → Pro → Pro+ → Teams, with Developer separate;
4. preserve current production entitlement/security-helper definitions;
5. treat these branch migrations as reconciliation references, not automatic apply steps:
   - `20260818213000_watchdog_full_tier_entitlement_contract.sql`
   - `20260818214500_watchdog_standard_entitlement_access_fix.sql`.

Current production lineage observed during the August 18 freeze includes:

- `20260818214156` — live full-tier entitlement contract;
- `20260818234619` — live Standard entitlement access fix.

The two narrow plan-RLS migrations below **are** part of the Intelligence apply list after their prerequisite Intelligence organization/workbench objects exist:

- `20260818221624_watchdog_teams_org_plan_boundary.sql`
- `20260818221753_watchdog_agent_workbench_plan_boundary.sql`.

## Gate D — apply database migrations in exact manifest order

Use `migrations.apply_in_order` from `supabase/intelligence-production-manifest.json` as the only allowlist.

Rules:

- apply in listed order;
- stop on the first unexpected error;
- do not bulk-apply staging-only migration history;
- do not infer missing migrations from the staging database;
- do not apply SQL that is absent from the frozen release head;
- do not reapply the two reconciliation-only entitlement migrations unless object-level review proves they are required and safe against current production definitions.

After SQL completes, verify:

- expected Intelligence tables/functions exist;
- RLS is enabled where designed;
- organization workspace requires Teams;
- Data Workbench saved-view ownership requires Agent+;
- Data Center remains Pro+;
- no anonymous entitlement escalation is possible;
- no staging fixtures or test accounts were introduced.

## Gate E — deploy only allowlisted Edge Functions

Deploy exactly the 23 functions in `edge_functions.deploy_allowlist` from the machine manifest, using the `verify_jwt` value pinned in `supabase/config.toml`.

Never bulk-promote staging. The manifest explicitly excludes preview-review/account helpers, self-tests, smoke/finaltest helpers, recalibration helpers and the temporary Analyst certification function.

The population worker deliberately uses `verify_jwt = false` at the gateway because it performs its own one-time worker-token/developer/optional automation authorization. This exception is source-controlled and must not be generalized to other Intelligence functions.

## Gate F — configure the worker fail closed

The scheduler reads the environment-local Vault entry:

`watchdog_intelligence_worker_url`

Until that value exists, recurring Intelligence remains disabled/fail-closed.

When controlled production worker activation is authorized, set it to:

`https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/intelligence-job-worker`

Scheduled dispatch uses a new one-time worker token stored only as a hash with a five-minute expiry. It does not require a permanent browser credential.

Optional Analyst prose configuration is not a launch requirement. `OPENAI_API_KEY` and `WATCHDOG_ANALYST_MODEL`, if configured, affect only the bounded prose rewrite. Deterministic governed Intelligence must remain useful with those absent.

## Gate G — authenticated plan smoke matrix

Run real authenticated acceptance for every tier.

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
4. accept either online prose or `provider_unavailable`, but require the governed answer to remain complete in both cases;
5. run one deterministic scenario and verify explicit assumptions;
6. run page-native context from Dashboard/Home against the same governed source contract.

The August 18 staging certification already proved the real Analyst remains complete with 18 evidence items and an identical stable governed payload when the prose provider is absent. Production still receives a post-deploy smoke.

## Gate I — controlled population canary

Keep broad scheduler/customer visibility off.

1. create one controlled Pro+ scope with a very small known property set;
2. dispatch one job;
3. verify queue → worker → run → finding → Daily Intelligence lineage;
4. verify candidate/processed counts reconcile;
5. run the same scheduled scope/day again and verify no duplicate job;
6. use the accepted staging failure certification for destructive failure cases unless production safety policy explicitly permits a controlled production failure probe;
7. verify stale locks remain reclaimable;
8. verify one-time worker-token fields are cleared on completion/failure;
9. remove canary data if it is not intended to persist.

## Gate J — stop/rollback acceptance

Before activating recurring delivery, prove the operator can stop it.

Primary stop order:

1. keep or return customer visibility to off;
2. deactivate the `watchdog-intelligence-dispatch` cron job;
3. disable scheduled scopes if the queue must remain frozen;
4. remove/disable `watchdog_intelligence_worker_url` if recurring dispatch must fail closed;
5. cancel only queued/running rollout jobs, preserving completed audit evidence;
6. redeploy last accepted Edge Function versions if a function regression occurred;
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

Review advisor **delta** rather than mechanically trying to reach zero warnings. Intentional closed service tables and reviewed SECURITY DEFINER boundaries must not be opened merely to silence a lint.

## Gate L — customer visibility last

Only after every technical gate passes **and** explicit customer-launch authorization is given:

1. confirm any applicable commercial/public launch gates are satisfied for the audience being opened;
2. enable intended customer-facing Intelligence entry points;
3. keep Teams self-service aligned with commercial policy;
4. observe uptime/errors/job queue closely during the controlled launch window;
5. preserve stop controls and rollback ownership.

A technical production canary with customer visibility off is not a public launch.

## Accepted pre-production evidence

See `property/docs/intelligence-release-certification-2026-08-18.md` for completed staging evidence covering:

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
