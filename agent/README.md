# Watchdog Agent landing page

This directory serves the clean public route `/agent`. `middleware.js` includes `/agent` in the existing root static-page allowlist. The page uses the repository's static HTML, CSS and JavaScript architecture.

## Offers and checkout

- Agent Founding Lifetime: **$1,499 one time**, with 25-property Agent capacity.
- Agent Annual: **$590 per year**, recurring until canceled, with the same Agent capacity.
- Usage-based services, direct mail, third-party data and overages are separate.

Both buttons use the existing `/property/js/billing-client.js` and authenticated Supabase functions. Lifetime invokes `create-lifetime-checkout`; annual invokes `create-checkout-session` with yearly cadence. Signed-out visitors continue through the clean `/dashboard` route with their selected offer stored in session storage. Server release gates remain authoritative. This page does not enable paid enrollment or change Stripe prices.

## Preview and interaction

Serve the repository root using its normal development environment, then open `/agent`. Open `/agent?preview=annual` to inspect the annual dialog directly.

After seven seconds and visitor engagement, desktop top-edge exit intent can show the annual offer once per browser tab session. On touch devices, eligible outbound navigation offers the same dialog with an explicit continuation link. Browser close, reload and history navigation are never trapped. Visitors can also choose “Prefer annual?” in the footer. Native dialogs support keyboard dismissal, focus containment and backdrop dismissal.

The product tour contains an actual screenshot of the public Watchdog Uniformity Index and a clearly disclosed illustrative Agent dashboard. Sample property figures are not presented as live customer data. Coastal art, the house illustration and the beagle are generated assets. The brand graphic follows the supplied reference. Local font licenses are in `assets/FONT-LICENSES.txt`.

Motion uses the Web Animations API and IntersectionObserver. Content renders immediately and reduced-motion preferences are respected.

## Verification scope

Browser verification covers offer selection, signed-out handoff, intercepted authenticated checkout requests, closed-gate recovery, keyboard navigation, product-tour tabs, nested screenshot viewing and exit intent. Checkout tests intercept all payment calls; they are not evidence of a real Stripe purchase.

The repository global Playwright runner is used in targeted mode for `/agent`: Chromium at 320, 390, 430, 768 and 1440 pixels, plus WebKit at 390 pixels. The miniature dashboard deliberately contains small representative text and offers an expanded screenshot view. Desktop reference typography also includes small supporting labels; these remain review findings rather than being hidden from the audit.

Publishing this page does not certify or enable the production billing lifecycle. It must use the existing repository release process.
