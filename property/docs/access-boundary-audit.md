# Access boundary audit

Watchdog uses three separate layers. A hidden menu item is never treated as security.

1. **Route gate:** protected pages load `access-guard.js`. It obtains the signed-in Supabase user and asks the database whether that user is a developer before revealing a developer-only page.
2. **Data boundary:** customer-owned tables use RLS ownership policies; account roles and paid plans are protected from browser edits; server-side plan functions do not trust local View As state.
3. **Server action boundary:** service-role jobs and Edge Functions own source-monitor event fan-out, billing writes and other sensitive operations. Browser clients receive only the publishable client key.

## What is covered automatically

`node property/scripts/audit_access_boundaries.mjs` validates the source contract on every push and pull request:

- every known developer-only and signed-in route declares its required access level and loads the route gate;
- developer status is server-evaluated, with explicit sign-in and restricted redirects;
- entitlement/developer RPCs are revoked from anonymous clients;
- the key profile and entitlement migrations include the expected RLS/server-plan primitives; and
- no service-role credential appears in browser-delivered `/property` JavaScript or HTML.

## What still requires staging verification

Static tests cannot prove a deployed database’s current grants or RLS behavior. Before paid enrollment opens, test with three disposable accounts in staging:

| Account | Must be allowed | Must be denied |
| --- | --- | --- |
| Signed out | Public marketing/lookup only | Pulse, Marker detail, Dashboard, developer routes |
| Standard | Own saved work and Standard report data | Developer routes, Pro+/Data Center saved views, server actions |
| Developer | Current internal route set | No cross-user customer data unless a deliberate service workflow is used |

Run Supabase security advisors after every schema change and keep the results with the release record. The `saved_properties` legacy table is explicitly part of the staging RLS check because it predates this migration set.
