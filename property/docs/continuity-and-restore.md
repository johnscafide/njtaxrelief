# Backup, restore and continuity runbook

## Objectives

- Recovery point objective (RPO): no more than 24 hours for the database. Current source files and migrations remain in version control.
- Recovery time objective (RTO): 4 hours for a declared production incident.
- Quarterly cadence: restore into an isolated Supabase project, never over production.
- Billing-provider state is reconciled as part of recovery, regardless of which supported processor is active at the time.

## Verified baseline

The NJW-42 isolated production restore rehearsal completed successfully on August 18, 2026.

- Observed RPO: **0 minutes**.
- Observed RTO: **3 minutes**.
- 112 public tables reconciled.
- 6 Auth users reconciled.
- 125 migration-history rows reconciled.
- Storage bucket/object counts reconciled.
- Billing-provider account/event state and state hash reconciled.
- The restore occurred in a separate restore-only project. Production data was not overwritten.
- Evidence is persisted in the production continuity control plane under the `restore_rehearsal` drill type.

The observed drill result is evidence of the tested path, not a promise that every future incident will recover in three minutes. The operating objective remains four hours until a longer history of successful drills supports tightening it.

## Quarterly drill

1. Record the production backup timestamp, source release and incident owner.
2. Create an isolated Supabase project with no public custom domain or outbound customer messaging.
3. Confirm the isolated target is fresh before any restore begins.
4. Restore the selected database backup and deploy the matching migrations/functions. Hosted Supabase platform-managed roles must not be replayed over the target's managed role inventory.
5. Reconcile row counts for users, entitlements, saved properties, cases, reports, migrations and current billing-provider events/state.
6. Reconcile Storage bucket/object manifests and sample-download protected objects when Storage contains customer files.
7. Run anonymous, Standard, Agent/Pro, Pro+, Teams where available, and Developer authorization tests against the isolated URL.
8. Record start/completion times, RPO/RTO result, discrepancies, hashes and evidence references in `continuity_drills`.
9. Mark `isolated_restore_drill` passed only after reconciliation and smoke checks complete successfully.
10. Retire the restore-only project and restore the normal staging environment if staging capacity was temporarily used for the drill.

## Billing recovery

The configured Live payment processor is the monetary transaction system of record. Watchdog's server-owned entitlement state must reconcile to verified signed provider events before paid access is reopened after a recovery. Never grant a paid plan from browser metadata, a success redirect or a manual client-side override.

If the billing provider changes, update the provider adapter, event normalization contract, reconciliation query and Live lifecycle evidence before treating the new provider as launch-ready.

## Customer communication template

> Watchdog experienced a service interruption affecting [surface] from [start] to [end]. Property records and account data were restored to [recovery point]. [No customer action is required / action]. We verified account access and, where applicable, billing state before reopening service. Contact the Watchdog support team with questions.

## Evidence standard

A screenshot alone is insufficient. Store the isolated project reference, backup timestamp, release version, measured RPO/RTO, reconciliation counts and hashes, test output and reviewer/evidence reference in the drill record. Never store database passwords, service-role keys or payment credentials in the evidence record.
