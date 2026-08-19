# Watchdog WCAG 2.2 AA Readiness Baseline

**Baseline date:** 2026-08-19  
**Target:** WCAG 2.2 Level AA  
**Status:** Readiness in progress. No site-wide WCAG 2.2 AA conformance claim is authorized yet.

## Conformance rule

A Level AA claim requires the applicable page/journey to satisfy all Level A and Level AA success criteria. Responsive variations are part of the page and must be evaluated, not excluded. Automated scanners are evidence helpers, not sufficient by themselves.

## Initial Watchdog test scope

### Public journeys

- `/property/` property lookup/landing experience
- account/sign-in entry flow
- `/property/privacy`
- `/property/terms`
- `/property/trust`
- pricing/plan discovery
- public report/property pages that are intended for consumer use

### Authenticated journeys

- Dashboard
- Watchlist / Home
- Account and billing
- Professional Hub
- Agent Control
- Data Workbench
- Marketing Studio
- report/analysis workflows
- developer-only surfaces where practical, although public/customer workflows take priority

## Required manual checks

Each representative journey must be checked at desktop and mobile widths for:

1. Keyboard-only operation with logical focus order.
2. Visible focus indicators that are not obscured.
3. No keyboard traps in dialogs, menus, maps or overlays.
4. Semantic headings and landmarks.
5. Accessible names for buttons, links, icon-only controls and form fields.
6. Error identification and instructions that do not depend only on color.
7. Sufficient text/non-text contrast.
8. Zoom and reflow without loss of essential content or horizontal trapping where not necessary.
9. Target size and spacing for touch controls.
10. Accessible status/error announcements for asynchronous actions.
11. Dialog focus management and Escape/close behavior.
12. Table/chart alternatives or text summaries where visual data communicates essential information.
13. Image alternative text; decorative imagery must not create noise.
14. Authentication that does not rely on inaccessible cognitive-function tests.
15. Consistent navigation and component identification.
16. Motion/animation that respects reduced-motion preferences where animation is nonessential.

## Automated baseline plan

Use a no-cost automated accessibility scan as a **non-blocking baseline first**, then promote stable rules to release gates. The automated evidence should cover representative public pages immediately and authenticated staging journeys once login-safe test automation is wired.

Recommended implementation path using the existing Playwright staging workflow:

- add `@axe-core/playwright` alongside the existing Playwright installation;
- scan the representative public pages against the local release-candidate server;
- retain JSON results as a GitHub Actions artifact;
- initially fail only on confirmed critical violations to avoid turning unknown legacy debt into an unsafe blind bypass;
- expand authenticated scans using the existing staging test accounts;
- track violations to remediation instead of suppressing them without rationale.

## Evidence record template

For each tested page/journey retain:

- route and viewport;
- authenticated role if applicable;
- test date and release/commit;
- automated findings by severity;
- keyboard result;
- focus-order result;
- screen-reader/manual semantics notes;
- contrast/reflow result;
- defects opened/fixed;
- reviewer and next review date.

## Public claim policy

Do not display a W3C WCAG 2.2 AA logo or say "WCAG 2.2 AA compliant" until a complete scoped conformance review supports the claim. Any eventual statement must name the scope/date and must not imply that W3C independently certified Watchdog.

## Official references

- WCAG 2.2 Recommendation: `https://www.w3.org/TR/WCAG22/`
- W3C Level AA conformance information: `https://www.w3.org/WAI/WCAG2AA-Conformance`
