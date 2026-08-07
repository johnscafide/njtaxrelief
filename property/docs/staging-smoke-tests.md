# Staging access smoke tests

This test is deliberately manual-dispatch only and refuses the production domain. It tests the anonymous boundary: a visitor is sent to Dashboard sign-in before any authenticated or developer-only Watchdog route is usable.

## Run it

1. Deploy the current branch to a non-production hostname, such as a hosting preview or dedicated staging site.
2. In GitHub Actions, open **Staging access smoke** and click **Run workflow**.
3. Enter the staging URL. Do not enter `njpropertytaxrelief.com`.
4. Confirm the job passes before merging/activating a sensitive release.

## Before Stripe activation

Add three disposable staging accounts and extend the smoke suite with these checks:

- Standard user can view own saved work and Standard marker detail, but cannot reach developer routes or Pro+/Data Center saved views.
- Pro user receives professional tools without upgrade prompts.
- Developer can access the internal route set, while View As changes presentation only—not server entitlements.

Do not use a real customer account or production data in this workflow.
