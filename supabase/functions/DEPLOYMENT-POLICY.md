# Supabase Edge Function deployment policy

Git is the source of truth for production Edge Functions.

## Required workflow

1. Make every Edge Function change under `supabase/functions/<function>/` in this repository first.
2. Review and commit the source change before deploying it to Supabase.
3. Deploy the committed function source. Do not edit a production function directly in the Supabase dashboard or Management API and leave the change uncommitted.
4. After deployment, verify the deployed function version and behavior against the committed source.
5. If an emergency production edit is unavoidable, immediately pull the deployed source back into this repository before any subsequent deployment.

The inventory guard in `.github/workflows/supabase-function-source-guard.yml` fails when a production-tracked function snapshot is missing from Git. It is intentionally repository-side: credentials for the Supabase Management API are not stored in GitHub Actions.

This policy was established while resolving NJW-141 after production `workbench-hydrate` advanced to v10 while the repository remained on an older resolver. Deploying from that stale checkout would have rolled production backward.
