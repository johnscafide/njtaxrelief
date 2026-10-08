# Watchdog Agent landing page

This directory serves the clean public route `/agent`. `middleware.js` includes `/agent` in the existing root static-page allowlist. The page uses the repository's static HTML, CSS and JavaScript architecture.

## Offers and checkout

- Agent Lifetime: **$99 one time**, with 100-property Agent capacity. There is no monthly or annual plan and no free trial.
- Usage-based services, direct mail, third-party data and overages are separate.

The checkout button uses the existing `/property/js/billing-client.js` and authenticated Supabase functions. It invokes `create-lifetime-checkout`. Signed-out visitors continue through the clean `/dashboard` route with their selected offer stored in session storage. Server release gates remain authoritative. This page does not enable paid enrollment or change Stripe prices.

## Preview and interaction

Serve the repository root using its normal development environment, then open `/agent`.

The page has no exit-intent offer. Native dialogs support keyboard dismissal, focus containment and backdrop dismissal.

The hero and the product tour use real screenshots of the live Watchdog property page and the public Uniformity Index (taken Oct 8, 2026). Coastal art, the house illustration and the beagle are generated assets. The brand graphic follows the supplied reference. Local font licenses are in `assets/FONT-LICENSES.txt`.

Motion uses the Web Animations API and IntersectionObserver. Content renders immediately and reduced-motion preferences are respected.

## Verification scope

Browser verification covers offer selection, signed-out handoff, intercepted authenticated checkout requests, closed-gate recovery, keyboard navigation, product-tour tabs, and nested screenshot viewing. Checkout tests intercept all payment calls; they are not evidence of a real Stripe purchase.

The repository global Playwright runner is used in targeted mode for `/agent`: Chromium at 320, 390, 430, 768 and 1440 pixels, plus WebKit at 390 pixels. The miniature dashboard deliberately contains small representative text and offers an expanded screenshot view. Desktop reference typography also includes small supporting labels; these remain review findings rather than being hidden from the audit.

Publishing this page does not certify or enable the production billing lifecycle. It must use the existing repository release process.
