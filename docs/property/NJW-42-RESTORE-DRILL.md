# NJW-42 isolated restore drill

This runbook exists only to satisfy the NJW-42 continuity gate with reproducible evidence. It must never restore into the production project or the four-role acceptance staging project.

## Safety model

The workflow `.github/workflows/njw-42-isolated-restore-drill.yml` is manual-dispatch only and requires the exact confirmation string `RESTORE-NJW-42`.

Production is used as the logical backup source and evidence-control-plane destination. The database restore itself may run only against a separate, fresh Supabase project. The workflow validates all project refs before doing any restore work and refuses either production or the four-role acceptance staging project as a target.

Logical dump files stay on the ephemeral GitHub runner. They are never uploaded as Actions artifacts because they can contain production database and authentication data.

## Required GitHub `staging` environment secrets

- `NJW42_PRODUCTION_DB_URL`: production Session Pooler or direct Postgres connection string.
- `NJW42_RESTORE_DB_URL`: Postgres connection string for the fresh isolated restore target.
- `NJW42_RESTORE_PROJECT_REF`: project ref for that isolated restore target.
- `NJW42_SUPABASE_ACCESS_TOKEN`: Supabase personal access token used only to copy the Vault encryption root key between the two projects via the Management API.

Do not put any of these values in the repository, workflow inputs, issue comments, or Actions logs.

## What the drill does

1. Confirms source/target project identities and refuses unsafe targets.
2. Captures a sanitized source manifest: database size, public table count, Auth user count, Storage bucket/object counts, migration-history count, Paddle event count, Paddle entitlement count, and a SHA-256 digest of current Paddle entitlement state.
3. Copies the production Vault encryption root key to the isolated restore target without logging key material. This is required for a manual logical migration when Vault/column encryption is in use.
4. Creates fresh Supabase CLI role, schema, data, and migration-history dumps on the ephemeral runner.
5. Refuses to continue unless the restore target is fresh.
6. Restores the logical backup with triggers disabled during data import as recommended by Supabase.
7. Compares source and target Auth counts, public table counts, migration history, Storage metadata, Paddle event counts, Paddle account counts, and the Paddle-state digest. It also smoke-queries the three production release-control tables.
8. Measures elapsed restore time as observed RTO. An on-demand logical snapshot with matching restored state records observed RPO as zero minutes.
9. Only after all checks pass, inserts a passed `continuity_drills` record and marks the `isolated_restore_drill` row in `platform_release_gates` passed in production.
10. Deletes all logical dump files from the runner in an `always()` cleanup step.

## Expected failures are fail-closed

A missing secret, wrong project ref, non-fresh target, failed Vault-key transfer, dump/restore error, mismatched Auth/Storage/Paddle state, or missing control-plane table stops the workflow before the production gate is marked passed.

If Supabase CLI restore reports a platform-role or `supabase_admin` ownership incompatibility, do not weaken the production database or ignore the error. Reconcile the generated logical dump according to Supabase's documented migration guidance and rerun against a fresh isolated target.

## Cleanup

After evidence is recorded and NJW-42 is closed, remove or pause temporary restore infrastructure as appropriate. The four-role acceptance staging project is separate and must not be destroyed until its own acceptance evidence is complete.
