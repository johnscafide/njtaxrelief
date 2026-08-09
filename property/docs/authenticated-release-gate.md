# Authenticated release gate

The remote gate proves server authorization with four disposable **staging-only** accounts: Standard, Pro, Pro+ and Developer. It verifies entitlement RPC results, the developer boundary and a real Pro+ RLS write/cleanup while proving Standard cannot perform the same write.

## Configure the GitHub staging environment

Add these environment secrets:

- `STAGING_SUPABASE_URL`
- `STAGING_SUPABASE_PUBLISHABLE_KEY`
- `WATCHDOG_TEST_STANDARD_EMAIL` / `WATCHDOG_TEST_STANDARD_PASSWORD`
- `WATCHDOG_TEST_PRO_EMAIL` / `WATCHDOG_TEST_PRO_PASSWORD`
- `WATCHDOG_TEST_PRO_PLUS_EMAIL` / `WATCHDOG_TEST_PRO_PLUS_PASSWORD`
- `WATCHDOG_TEST_DEVELOPER_EMAIL` / `WATCHDOG_TEST_DEVELOPER_PASSWORD`

Each account must be disposable and must have the matching server entitlement. Do not use production customer credentials. Run **Authenticated release gate** manually before a paid release. The script refuses Watchdog’s production Supabase project unless an explicit override is provided; that override should not be set in ordinary CI.
