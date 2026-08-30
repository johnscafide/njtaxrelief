# Watchdog Content Architecture Audit

Issue: NJW-296
Status: active migration inventory

This is a living audit, not a claim that every customer-facing JavaScript string has already been migrated. Classify each surface before changing it so dynamic data and entitlement behavior are not mistaken for static copy.

## Classification

- **STATIC** — editable human-written page copy; move to route HTML or an HTML partial.
- **SHARED** — canonical shared chrome/component copy; may remain component-driven when duplication would cause drift.
- **DYNAMIC** — wording or markup genuinely produced from user state, auth/entitlement state, live catalog state or runtime interaction.
- **DATA/CMS** — governed content/data that belongs in Supabase or another canonical data source.

## Completed in NJW-296

| Surface | Previous issue | New ownership |
| --- | --- | --- |
| Paid launch banner/hero | CSS + static markup + copy inside `property/js/paid-launch-banner.js` | Static templates in `property/partials/paid-launch.html`; presentation in `property/css/paid-launch.css`; JS only loads, places, dismisses and tracks |
| Pro launch-list copy | `paid-launch-banner.js` rewrote Pro headings, CTA labels, FAQ text, form source/privacy copy after load | `property/pro/index.html` |
| Pro source-transparency block | `pro.js` created a complete static marketing/evidence section at runtime | `property/pro/index.html` |
| Pro Intelligence presentation | Large CSS string in `pro.js` | `property/css/pro-intelligence-offer.css`; JS keeps live billing-catalog binding |
| Global rule | No repository-wide contract | `docs/CONTENT_ARCHITECTURE.md` + CI guard |

## Intentional runtime ownership

| File/surface | Class | Reason |
| --- | --- | --- |
| `property/js/watchdog-universal-menu.js` | SHARED + DYNAMIC | One canonical navigation/account component changes with sign-in, plan and developer state. Duplicating it in every route would create drift. |
| `property/js/pro.js` Intelligence offer values | DYNAMIC | Price/promotion wording reflects the server-owned billing catalog; static HTML must not become a competing price source of truth. |
| Data Center renderers | DYNAMIC / DATA | Tables, marker availability, filters and entitlement-controlled data are runtime output. Stable explanatory copy should still migrate when encountered. |
| Scan / case-value renderers | DYNAMIC / DATA | Findings and case values are evidence/data-derived. Static instructions, headings or upsell paragraphs should be separated when encountered. |
| Watchdog Intelligence voice/browser renderers | DYNAMIC / DATA | Generated intelligence, evidence and status states are inherently runtime-driven. |
| Insights article cards | DATA/CMS | Article title/dek/kicker/image/publish data comes from `public.insights_articles`; it should not be duplicated as static page copy. |

## Next cleanup queue

### P1 — property landing presentation ownership

`property/js/robust-public-brand.js`

Current violations:
- rewrites static landing/showcase sentences after load;
- inserts the ROBUST Framework navigation link at runtime;
- injects a CSS block for the lookup photo CTA;
- owns static homeowner-photo CTA wording.

Target:
- move stable ROBUST labels/showcase copy to the actual landing/showcase source;
- move photo CTA styles to CSS;
- keep only runtime address/href binding and compatibility behavior in JS.

### P1 — landing showcase/static cards

`property/js/landing-showcase.js`

Mixed ownership:
- property cards, recent-property facts and CMS article cards are legitimately dynamic;
- Free-account promo copy, recent-section scaffold/headings, static empty-state copy and ad campaign/disclosure copy are human-editable content currently embedded in JS.

Target:
- move stable section/card scaffolds to HTML templates/partials;
- keep property/CMS data binding in JS;
- move ad creative/disclosures to a governed content/config source instead of application logic.

### P1 — public navigation runtime style hotfixes

`property/js/public-nav.js`

Current issue:
- injects menu interaction and score-placement CSS at runtime.

Target:
- move stable presentation contracts into the canonical stylesheet after confirming the cache/compatibility workaround is no longer required;
- retain menu state, recent-property persistence and interaction code in JS.

### P2 — professional surfaces

Audit `data-center-public-v2.js`, `data-center-runtime-v2.js`, `scan-case-value-ui.js`, `scan.js`, `agent-vanity-profile.js`, `agent-portal-qr.js` and related professional components for static headings/instructions embedded alongside real data rendering.

Target:
- stable UI shell and explanatory copy in HTML/templates;
- dynamic values, state and entitlement-controlled rendering in JS.

### P2 — intelligence/landing enhancement scripts

Audit `landing-recent-intelligence.js`, `lookup-summary-enhancements.js`, `watchdog-intelligence-voice.js` and `watchdog-intelligence-voice-browser.js`.

Target:
- do not move generated findings/evidence into HTML;
- move only static helper copy, headings, empty-state explanations or presentation CSS out of runtime code.

## Guardrail

New JavaScript work is checked by `scripts/check-content-architecture.mjs` in `.github/workflows/content-architecture-contract.yml`.

The guard intentionally does not ban strings in JavaScript. It flags newly introduced long prose/HTML/runtime CSS so a reviewer must either move it to the correct source or document a narrow `content-architecture: dynamic` exception.

## Security rule

Never satisfy this audit by placing protected Pro/Pro+ payloads, private customer data, server-only evidence or secret configuration in static HTML. Content ownership and authorization are separate concerns; server-owned entitlement boundaries remain authoritative.
