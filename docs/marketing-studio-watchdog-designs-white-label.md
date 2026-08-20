# Watchdog Designs white-label contract

Status: active production naming rule

## Public name

Marketing Studio's direct-mail production/design layer is customer-facing as **Watchdog Designs**.

Compact UI surfaces may use **WDD** when the full name is too long, for example proof/status badges.

## Vendor privacy boundary

The underlying fulfillment/design vendor is an implementation detail. Its company name, acronym, portal terminology and integration branding must not appear in customer-facing Marketing Studio UI, emails, receipts, review screens, creative previews, error messages or help text.

Internal source code may retain existing provider keys, database columns, RPC names, Edge Function names, migration names and adapter identifiers when renaming them would create migration risk. Those identifiers are not product copy.

## Public terminology

Use:

- Watchdog Designs
- WDD proof
- Watchdog Designs production proof
- Watchdog Designs editor
- Watchdog Designs handoff
- Watchdog Designs mailing area
- production service / fulfillment service when a generic term is clearer

Do not expose the underlying vendor name or acronym.

## Mechanical authority

White-labeling does not change the production safety boundary. Watchdog Studio owns campaign strategy, copy, preview creative and generated visual assets. Watchdog Designs represents the customer-facing production layer. The underlying fulfillment provider remains internally authoritative for mechanical print setup, postal mechanics and final provider proof until Watchdog has certified an equivalent in-house contract.

## Implementation guard

`property/js/marketing-studio-providers.js` installs a customer-facing text sanitization layer for Marketing Studio so legacy provider strings returned by older UI modules are displayed as Watchdog Designs without changing internal integration identifiers.

New customer-facing Marketing Studio code should use Watchdog Designs directly at source instead of relying on the sanitizer.
