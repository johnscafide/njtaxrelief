# Backup, restore and continuity runbook

## Objectives

- Recovery point objective (RPO): 24 hours for the database; current source files and migrations remain in version control.
- Recovery time objective (RTO): 4 hours for a declared production incident.
- Quarterly cadence: restore into an isolated Supabase project, never over production.

## Quarterly drill

1. Record the production backup timestamp, source release and incident owner.
2. Create an isolated Supabase project with no public custom domain or outbound customer messaging.
3. Restore the selected database backup and deploy the matching migrations/functions.
4. Reconcile row counts for users, entitlements, saved properties, cases, reports and Paddle events.
5. Reconcile Storage bucket manifests and sample-download protected objects.
6. Run Standard, Pro, Pro+ and Developer authorization tests against the isolated URL.
7. Record start/completion times, RPO/RTO result, discrepancies and evidence URL in `continuity_drills`.
8. Mark `isolated_restore_drill` passed only after a human reviews the evidence.

## Billing recovery

Paddle remains the billing system of record. Replay signed webhook events into the isolated endpoint, compare subscription/customer IDs and entitlement state, and resolve mismatches before serving traffic. Never grant a paid plan from browser metadata.

## Customer communication template

> Watchdog experienced a service interruption affecting [surface] from [start] to [end]. Property records and account data were restored to [recovery point]. [No customer action is required / action]. We verified billing and access state before reopening service. Contact the Watchdog support team with questions.

## Evidence standard

A screenshot alone is insufficient. Store the isolated project reference, backup timestamp, release version, measured RPO/RTO, reconciliation counts, test output and reviewer in the drill record.
