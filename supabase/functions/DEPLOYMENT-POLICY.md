# Supabase Edge Function deployment policy

Git is the source of truth for production Edge Functions.

## Required workflow

1. Make every Edge Function change under `supabase/functions/<function>/` in this repository first whenever possible.
2. Review and commit the source change before deploying it to Supabase.
3. Deploy the committed function source. Do not edit a production function directly in the Supabase dashboard, Management API, connector, or other production tool and leave the change uncommitted.
4. After every production deployment, verify the deployed function version, SHA-256 fingerprint, `verify_jwt` setting, and behavior against the committed source.
5. Refresh `supabase/functions/PRODUCTION-INVENTORY.json` in the same workstream. A production deployment is not complete until the current live version/hash/auth setting is recorded there.
6. If an emergency or connector/API production edit is unavoidable, immediately pull the deployed source back into this repository before any subsequent deployment. Reconcile the inventory before closing the task.

## Inventory tracking states

- `source_snapshot`: the committed `supabase/functions/<function>/index.ts` source has been explicitly checked against the production function for the inventory capture. The inventory must include the live version, SHA-256 fingerprint, and `verify_jwt` setting.
- `fingerprint_only`: production metadata is recorded, but committed source parity has not been established. **Do not redeploy a `fingerprint_only` function from a checkout.** Pull and verify its live source first, then promote the inventory entry to `source_snapshot` when parity is established.
- Other explicit tracking states may document legacy/external ownership, but they do not imply that a checkout is safe to deploy without a fresh parity check.

When production was intentionally deployed from source that was already merged to Git, a new source commit may not be necessary, but the post-deploy version/hash/`verify_jwt` inventory refresh is still mandatory before closeout.

The inventory guard in `.github/workflows/supabase-function-source-guard.yml` verifies rollback-critical source snapshots, validates production fingerprint records, and rejects `source_snapshot` entries whose committed `index.ts` is missing. It is intentionally repository-side: credentials for the Supabase Management API are not stored in GitHub Actions.

This policy was established while resolving NJW-141 after production `workbench-hydrate` advanced beyond the repository copy. Deploying from that stale checkout would have rolled production backward. The recurrence rule is therefore simple: **deploy, verify, reconcile Git and inventory, then close the task.**
