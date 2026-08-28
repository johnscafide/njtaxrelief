# Google sign-in and OAuth branding cutover

Goal: Google consent and authorization flows should identify the product as **Watchdog** and should no longer present the random Supabase project hostname as the user-facing callback destination.

The approved primary Watchdog production domain is `watchdogindex.com`, with `https://www.watchdogindex.com` as the canonical serving host. The branded Supabase project hostname for authentication and OAuth callbacks is:

`login.watchdogindex.com`

`auth.watchdogindex.com` is intentionally not used because that hostname is already delegated through existing Brevo/Sendinblue NS records. Those records must not be removed as part of this cutover.

## What the custom domain changes

Supabase custom domains are the supported way to replace `uvkvaxljhhngydvlrzom.supabase.co` in Supabase-hosted Auth/OAuth callback URLs. Supabase permits one custom domain per project. That hostname can serve Auth, Edge Functions, Storage and API routes; it is not an auth-only infrastructure boundary even when the chosen hostname is `login.watchdogindex.com`.

Supabase custom domains are a paid project add-on for paid organizations. Current documented pricing is $0.0137/hour, approximately $10/month, and it is not covered by the Spend Cap.

The original Supabase project hostname remains active after custom-domain activation, so the migration can remain additive and reversible.

## Two Google callback families must be migrated

Watchdog currently uses two distinct Google OAuth paths.

### 1. Supabase social sign-in

Current callback:

`https://uvkvaxljhhngydvlrzom.supabase.co/auth/v1/callback`

Branded callback to add before activation:

`https://login.watchdogindex.com/auth/v1/callback`

### 2. Search Console / Google Ads authorization

This is Watchdog's own OAuth flow implemented by the `google-ads-oauth-start` and `google-ads-oauth-callback` Edge Functions. It is the flow used by Developer → Search & web performance.

Current callback:

`https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/google-ads-oauth-callback`

Branded callback to add before cutover:

`https://login.watchdogindex.com/functions/v1/google-ads-oauth-callback`

The Edge Functions support a `WATCHDOG_SUPABASE_PUBLIC_URL` environment override. Until that variable is configured, they deliberately fall back to the existing `SUPABASE_URL`, so staging this code does not change the live callback prematurely.

## Google Auth Platform branding

In Google Auth Platform → Branding, use:

- App name: **Watchdog**
- Homepage: `https://www.watchdogindex.com/`
- Privacy policy: the canonical Watchdog privacy-policy URL
- Terms: the canonical Watchdog terms URL
- Authorized domain: `watchdogindex.com`
- Logo: the current approved Watchdog logo

Complete Google's brand/app verification when required. A Supabase custom domain improves callback branding, but it does not bypass Google's test-user, publishing, sensitive-scope or verification requirements.

## Safe cutover order

1. Enable the Supabase Custom Domain add-on for production project `uvkvaxljhhngydvlrzom`.
2. Register `login.watchdogindex.com` in Supabase General Settings → Custom Domains.
3. In the DNS provider for `watchdogindex.com`, add the requested records. The CNAME should resolve `login.watchdogindex.com` to `uvkvaxljhhngydvlrzom.supabase.co`; add the Supabase-provided `_acme-challenge` TXT record exactly as supplied.
4. Reverify the hostname in Supabase and wait for SSL issuance. Do **not** activate it yet.
5. In the Google OAuth client used by Supabase social sign-in, add `https://login.watchdogindex.com/auth/v1/callback` while retaining `https://uvkvaxljhhngydvlrzom.supabase.co/auth/v1/callback`.
6. In the Google OAuth client shared by Search Console / Google Ads authorization, add `https://login.watchdogindex.com/functions/v1/google-ads-oauth-callback` while retaining `https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/google-ads-oauth-callback`.
7. Configure Google Auth Platform branding as Watchdog and ensure the appropriate developer/test account is allowed while the app remains in Testing.
8. Activate `login.watchdogindex.com` in Supabase. Supabase Auth will begin advertising the custom hostname immediately.
9. Set the production Edge Function secret/environment variable `WATCHDOG_SUPABASE_PUBLIC_URL=https://login.watchdogindex.com` so Search Console / Google Ads authorization uses the branded callback as well.
10. Test, in order: email/session continuity, Google social sign-in, logout, Search Console connect, Search Console refresh, Google Ads connect if enabled, and mobile/private-browser flows.
11. Keep the old Supabase callback URLs registered during the coexistence period. Remove them only after sustained production acceptance and an explicit rollback decision.

## Rollback

If the branded domain causes an auth/provider regression:

- unset `WATCHDOG_SUPABASE_PUBLIC_URL` so custom Google Edge OAuth falls back to the default Supabase URL;
- keep the old Google redirect URIs registered;
- deactivate/remove the Supabase custom domain if necessary;
- continue using `https://uvkvaxljhhngydvlrzom.supabase.co` while the issue is corrected.

No database, user, entitlement or application-data migration is required for this hostname cutover.

## Current official references

- Supabase Google login: https://supabase.com/docs/guides/auth/social-login/auth-google
- Supabase custom domains: https://supabase.com/docs/guides/platform/custom-domains
- Supabase custom-domain usage/pricing: https://supabase.com/docs/guides/platform/manage-your-usage/custom-domains
- Google Auth Platform branding: https://console.cloud.google.com/auth/branding

Last reviewed: 2026-08-28.
