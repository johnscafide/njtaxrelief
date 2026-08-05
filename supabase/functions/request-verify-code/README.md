# Ownership verification mailer

Deploy `20260805180000_ownership_verification.sql`, then deploy this Edge Function with JWT verification enabled.

Required secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `POSTGRID_API_KEY`, `VERIFY_FROM_LINE1`, `VERIFY_FROM_CITY`, `VERIFY_FROM_STATE`, and `VERIFY_FROM_ZIP`. Set `POSTGRID_MODE=test` until a test postcard succeeds, then use `live` with the corresponding PostGrid key.

The code is generated only inside the function, stored as a salted SHA-256 digest, rate-limited to three requests per user per day, and expires after 30 days. No owner name is requested or stored.
