# Google sign-in branding cutover

Goal: the Google consent flow should identify the product as **Watchdog NJ Property Tax Relief** and should no longer present the random Supabase project hostname as the user-facing callback destination.

## What can change without touching application data

In Google Auth Platform → Branding, set the application name to **Watchdog NJ Property Tax Relief**, use the Watchdog logo, and use the production homepage, privacy-policy and terms URLs. Complete Google's brand verification when offered.

Google and Supabase both recommend branded OAuth configuration because it makes the relationship between the sign-in screen and the product clearer to users.

## Why the current screen says `uvkvaxljhhngydvlrzom.supabase.co`

That string is the Supabase Auth callback hostname. It is not UI copy from `index.html`, so changing a button or site title cannot safely replace it.

Supabase custom domains are the supported way to replace that hostname. A sensible production hostname for Watchdog is:

`auth.njpropertytaxrelief.com`

Supabase currently documents custom domains as a paid add-on for projects on a paid plan. Do not activate the custom domain until the Google OAuth client accepts both callback URLs.

## Safe cutover order

1. In the DNS provider, create the CNAME/TXT records Supabase requests for `auth.njpropertytaxrelief.com`.
2. Verify the custom domain in Supabase, but do not activate it yet.
3. In Google Auth Platform → Clients, add this Authorized redirect URI **in addition to** the existing Supabase callback:
   `https://auth.njpropertytaxrelief.com/auth/v1/callback`
4. Keep the existing callback during the transition:
   `https://uvkvaxljhhngydvlrzom.supabase.co/auth/v1/callback`
5. Configure/verify the Google application name, logo, homepage, privacy policy and terms as Watchdog NJ Property Tax Relief.
6. Activate the Supabase custom domain.
7. Test Google sign-in in a private browser on desktop and iPhone before removing or changing any old redirect configuration.
8. The original Supabase project domain continues to work, so client code does not need to be rewritten in the same deployment.

## Current official references

- Supabase Google login: https://supabase.com/docs/guides/auth/social-login/auth-google
- Supabase custom domains: https://supabase.com/docs/guides/platform/custom-domains
- Supabase custom-domain usage/pricing: https://supabase.com/docs/guides/platform/manage-your-usage/custom-domains
- Google Auth Platform branding: https://console.cloud.google.com/auth/branding

Last reviewed: 2026-08-08.
