# Watchdog PCI DSS Scope Memo

**Baseline date:** 2026-08-19  
**Scope:** Watchdog subscription checkout and paid marketing checkout architecture.  
**Status:** Internal scope analysis only. Watchdog does not claim PCI DSS compliance or certification through this memo.

## Observed architecture

The current subscription implementation creates a Stripe Checkout Session server-side in `supabase/functions/create-checkout-session/index.ts` and returns the provider-hosted `session.url` to the authenticated browser. Card entry is therefore intended to occur on Stripe-hosted payment pages rather than inside a Watchdog-hosted card form.

Current security evidence also includes:

- server-side authenticated checkout creation;
- server-authoritative price selection;
- Stripe webhook signature verification against the raw body;
- deduplication/event-ledger controls;
- test-account guardrails against live charges;
- controlled/open billing release gates;
- audit events for checkout creation and lifecycle changes.

## Cardholder-data boundary

Target boundary:

- Watchdog must not collect, log, store, process or transmit full card numbers, CVV/CVC, magnetic-stripe data, PIN data, or payment credentials in application forms, Supabase tables, analytics, logs or support tooling.
- Payment-provider IDs, subscription state, price IDs, invoice/payment status and limited billing metadata may be stored when necessary for the service, but they are not a substitute for cardholder-data handling controls.
- Any future embedded payment element, custom card form, telephone payment flow, or server-side card API use requires a fresh PCI scope review before implementation.

## Likely merchant validation path

The current hosted-redirect design appears consistent with the architecture commonly associated with **SAQ A eligibility**, because payment entry is intended to be fully outsourced. This is a **candidate classification only**. Watchdog must verify every current SAQ A eligibility criterion against the live implementation before selecting the questionnaire.

## 2026 requirement to retain in the roadmap

Even for SAQ A e-commerce merchants whose payment processing is outsourced, PCI SSC states that applicable external vulnerability scanning must be performed by a PCI SSC Approved Scanning Vendor (ASV). This is recorded as a future external-validation dependency because the current Watchdog budget is $0.

## No-cost work we can complete now

1. Keep cardholder data technically out of Watchdog.
2. Search code/schema/logging for accidental card-data collection patterns before billing changes.
3. Maintain an inventory of every payment entry point and provider.
4. Keep checkout pricing and entitlement decisions server-authoritative.
5. Preserve signed-webhook/replay/deduplication tests.
6. Patch public checkout pages and dependencies promptly.
7. Document administrative access to payment-provider dashboards and revoke unused access.
8. Keep the Trust Center language factual: "Payments are processed through Stripe-hosted Checkout" rather than "PCI certified."
9. Reassess scope whenever the payment UX or provider changes.

## Scope-change triggers

A new PCI review is mandatory before any of the following:

- card fields rendered directly by Watchdog;
- an iframe/embedded payment form replacing hosted redirect;
- payment data handled by an Edge Function or API;
- telephone/mail-order payment handling;
- a second payment processor going live;
- storage of cardholder/account data beyond provider tokens/IDs;
- custom payment JavaScript that can affect payment entry.

## External dependency

When budget permits and production billing is stable:

- confirm the correct current SAQ with the acquiring/payment relationship;
- complete the applicable SAQ/AOC process;
- arrange required ASV scanning for in-scope public e-commerce pages;
- remediate and retain evidence.

## Official references

- PCI SSC SAQ A guidance and FAQs: `https://www.pcisecuritystandards.org/`
- Stripe implementation evidence: `supabase/functions/create-checkout-session/index.ts`
