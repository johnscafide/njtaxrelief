# Marketing Studio automation and attribution

Marketing Studio separates campaign intent from provider execution. A campaign can be designed and funded without allowing a provider to spend money. Automation state, payment state, provider readiness, suppression and campaign spend limits are independent gates.

## Automation states

- `draft`: no runnable sequence.
- `armed`: sequence exists but has not been started.
- `running`: due steps may be claimed by the server orchestrator.
- `paused`: new provider spend is blocked.
- `stopped`: the campaign kill switch is active and new provider spend is blocked.

Users can configure, start, pause and stop their own campaigns through authenticated Marketing Studio RPCs. Provider adapters cannot bypass these controls.

## Sequence processing

Campaign steps contain a scheduled time, maximum attempts, dedupe key, retry time and last error. The service-only `marketing_claim_due_steps` function uses `FOR UPDATE SKIP LOCKED` so concurrent workers cannot claim the same step. Provider completion/failure is normalized through `marketing_normalize_provider_event`. Failed steps receive bounded retry scheduling until their maximum attempt count is reached.

The provider adapter remains responsible for the actual external API call. This keeps scheduling/retry policy centralized while letting PCM, CallRail, Google Ads and future providers implement their own transport details.

## Spend safety

A paid provider job must satisfy every applicable guard before it can enter a spend/submission state:

1. Campaign automation is not paused or stopped.
2. The job links to the exact server-generated quote.
3. The job links to the exact captured Stripe campaign payment for that quote.
4. The payment is not refunded.
5. The captured amount covers the quote.
6. The campaign hard spend cap is not exceeded.

Provider credentials and authoritative pricing remain server-side.

## Suppression

Suppression subjects are stored as SHA-256 hashes, never raw phone numbers, emails or mailing identifiers in the suppression ledger. User-facing suppression creation is Agent+ only. Provider adapters query suppression through a service-role-only function immediately before dispatch.

Email and SMS adapters must additionally enforce the provider-specific consent requirements defined by their adapter. The existence of a Watchdog property record is not consent for email or SMS.

## Campaign tracking

`marketing_create_tracking_link` creates a high-entropy opaque token tied to a campaign and a local Watchdog destination. The public `marketing-track` function accepts only that token and cannot accept an arbitrary redirect destination.

Supported normalized events are currently:

- `page_view`
- `qr_scan`
- `form_submit`

A form submission records an unqualified lead attribution. Richer lead qualification remains an authenticated/server workflow. Tracking payloads intentionally exclude property-owner profile data and arbitrary PII.

## Attribution and ROI

Marketing attribution can capture visits, form leads, provider-sourced calls, qualified leads, appointments, deals/closings and attributed revenue. The `marketing_campaign_metrics` RPC reports customer spend, vendor cost, Watchdog margin, attributed revenue, leads, appointments, deals and campaign ROI.

Manually entered revenue/GCI is explicitly marked as manual attribution until a connected CRM/provider can verify it.

## Aggregate recommendation learning

`marketing_performance_rollups` is service-only. It stores anonymized aggregate campaign performance only when a dimension has at least five distinct customer accounts. It is not exposed to authenticated customers and contains no user IDs. This creates a safe foundation for future Watchdog recommendations such as which campaign play or channel mix historically performs well without exposing one customer's campaign data to another.

## Dynamic audiences

Dynamic rules are stored separately from immutable audience snapshots. They support three modes:

- `review`: surface new matches for user review.
- `auto_add`: permit a future evaluator to add newly qualifying properties within configured limits.
- `auto_campaign`: permit a future orchestrator to initiate an explicitly approved automation.

The current foundation stores and governs these rules. A data-evaluation worker must still resolve the governed property criteria before `auto_add` or `auto_campaign` can produce new audience members.
