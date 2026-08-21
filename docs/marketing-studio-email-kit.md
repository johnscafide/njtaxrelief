# Marketing Studio Email: Kit private beta

NJW-264 establishes email/newsletter delivery as a provider-neutral Marketing Studio capability. Kit is the first live email-service adapter. The private beta is intentionally scoped to approved internal Watchdog accounts while preserving the same per-user isolation required for a future commercial release.

## Product model

Each Watchdog user owns independent connections and data:

`Watchdog user -> CRM connection -> eligible audience -> email-service connection -> sender identity -> newsletter draft/send -> attribution`

The CRM and email provider are separate choices. The initial pairing is BoldTrail + Kit, but neither side is hard-coded into the long-term product contract. Future CRM providers and email services can plug into the same workflow.

A user's CRM contacts, provider credentials, subscriber mappings, sender identities, suppressions, campaigns and analytics must never be exposed to another user unless a future organization/team feature explicitly authorizes shared access.

## Private-beta authentication

Kit V4 API keys are supported only for this internal/private beta. The key is submitted to a JWT-protected server endpoint, validated against Kit's account endpoint, and stored through the existing Marketing Studio Vault secret helpers. It is never written to browser-readable tables, HTML, JavaScript, GitHub, logs or provider metadata.

Public/commercial Kit connections must migrate to Kit OAuth 2.0. The provider registry advertises this boundary with `api_key_private_oauth2_public`; no product schema depends on API-key authentication.

BoldTrail uses the existing user-scoped native CRM tables and Vault-backed token storage. The private Newsletter Studio gateway grants the two beta accounts access without changing their normal Watchdog paid-plan entitlements.

## Audience and consent boundary

A CRM record containing an email address is not evidence of newsletter consent.

The first reconciliation workflow is deliberately conservative:

1. Load the signed-in user's normalized CRM contacts with valid email addresses.
2. Deduplicate by normalized email inside the request.
3. Load subscribers already present in that same user's Kit account.
4. Link only matching existing Kit subscribers.
5. Persist the Kit subscriber ID, provider state and SHA-256 email hash in `marketing_email_contact_links`.
6. Do not upload CRM-only email addresses to Kit.

Kit `active` subscribers can be marked eligible for the private workflow. Bounced, complained, cancelled or inactive subscriber states are retained as non-eligible states. Provider webhook reconciliation for unsubscribe/bounce/complaint changes is a required follow-on before broad commercial release.

## Sender identities

`marketing_email_sender_identities` stores a user-scoped sender identity for one email-provider connection. No personal domain is hard-coded into product logic. Kit's account primary email can be recorded as `provider_primary`; additional addresses remain `declared` until provider-level verification is established.

## Broadcast safety

Newsletter Studio creates Kit broadcasts as drafts by default. The server sanitizes active HTML content before sending it to Kit and stores only a SHA-256 content fingerprint in the local broadcast mirror.

Scheduling is server-guarded:

- a scheduled broadcast requires `confirm_send=true`;
- scheduling to all subscribers also requires `confirm_all_subscribers=true`;
- the current private UI exposes draft creation only, so a normal browser action cannot accidentally schedule a live send.

The local `marketing_email_broadcasts` table mirrors provider IDs/status, audience targeting, sender and scheduling metadata for future attribution and audit use.

## Database security

The beta-access, sender-identity, contact-link and broadcast tables all have RLS enabled. Browser roles have no direct grants or policies on these tables. The JWT-protected gateway performs user-scoped operations with the service role only after verifying the current user and checking `marketing_email_beta_access`.

`marketing_delete_provider_secrets(uuid)` is executable only by `service_role`; `anon` and `authenticated` cannot invoke it.

## Edge Function slot

The Supabase project was at its Edge Function-count limit during NJW-264. Rather than increase plan cost or disturb active production functions, the retired `tmp-boldtrail-probe` slot was repurposed as the private Newsletter Studio provider gateway. The source file documents this explicitly.

The gateway slug is an implementation detail, not part of the provider data model. When a function slot becomes available, it should be renamed to a permanent provider-gateway slug without changing stored connections or subscriber mappings.

## Commercialization path

Before exposing Newsletter Studio to paid customers:

1. Replace the private beta allowlist with normal feature/add-on entitlements.
2. Implement Kit OAuth 2.0 connect/callback/refresh/revoke flows.
3. Add normalized provider webhook ingestion for unsubscribe, bounce and complaint events.
4. Add consent-source workflows for importing or syncing subscribers rather than treating CRM presence as permission.
5. Add provider capability adapters for additional email services such as Resend, Mailchimp, Constant Contact, ActiveCampaign or HubSpot as demand warrants.
6. Add CRM adapters independently of email-provider adapters.
7. Add team/organization sharing only with explicit role, RLS and sender-ownership rules.
8. Add plan limits, usage/credit billing and provider-health UX.
9. Promote the temporary gateway slug to a permanent function when capacity allows.

## Current private-beta UI

`/property/newsletter-studio/`

The page provides:

- user-scoped BoldTrail connection, sync and disconnect;
- user-scoped Kit connection, health check and disconnect;
- sender identity management;
- existing-subscriber reconciliation;
- Kit tag/segment discovery;
- HTML newsletter preview;
- Kit draft creation;
- local recent-broadcast history.

Live canary validation still requires each beta user to connect their own Kit credentials. No provider credentials are pre-seeded by Watchdog.
