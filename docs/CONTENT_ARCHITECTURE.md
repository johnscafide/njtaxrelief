# Watchdog Content Architecture

Status: canonical repository rule
Owner: NJW-296

## Global rule

Watchdog separates editable content from presentation and runtime behavior so page copy remains easy to find, review and change.

- **HTML owns static page copy.** Headings, explanatory paragraphs, FAQs, disclosures, ordinary CTA wording, static labels and long-form marketing/editorial copy belong in the page HTML or an HTML partial.
- **CSS owns presentation.** Layout, colors, typography, spacing, responsive behavior and component styling belong in stylesheets. Runtime `<style>` injection is reserved for exceptional state that cannot be represented with existing classes/custom properties.
- **JavaScript owns behavior and state.** Event handling, show/hide behavior, auth state, entitlement state, user interaction, analytics, data binding, data-derived output and genuinely dynamic status/error/success messaging belong in JavaScript.
- **Shared chrome may be component-driven.** Navigation, account menus and similar shared UI may render from one canonical runtime component when duplicating HTML across many routes would create drift. Static marketing/editorial copy should not be hidden inside those components unless it is inseparable from state.
- **Supabase/CMS owns governed content collections and governed data.** Database-backed editorial collections, product data, source facts and governed runtime content should remain in their canonical data source rather than being copied into static HTML.

## The maintenance test

Ask: **Could a non-developer reasonably want to change this sentence without changing application behavior?**

If yes, the sentence normally belongs in HTML/HTML partial or the appropriate CMS/data source, not in JavaScript.

Examples that belong in HTML:

- hero headlines and subheads
- product/plan descriptions
- FAQ questions and answers
- marketing benefit copy
- explanatory sections
- static disclaimers and disclosures
- static button/link wording
- launch announcement copy shared through an HTML partial

Examples that may stay in JavaScript:

- `12 properties found`
- `Updated 4 minutes ago`
- auth/plan-dependent menu labels
- data-derived Watchdog Intelligence findings
- validation, loading, success and error states
- a price/cadence value selected from a verified billing catalog
- a dynamic label whose wording changes because the underlying state changed

## Dynamic content still needs a clean structure

Dynamic does not mean JavaScript should own the entire visual component.

Prefer this pattern:

1. Put the stable component scaffold and default/fallback copy in HTML.
2. Put component styles in CSS.
3. Give dynamic fields explicit `data-*` hooks.
4. Let JavaScript update only the fields that actually depend on state or data.

For a reusable cross-page component, put the stable markup/copy in an HTML partial or `<template>` and let JavaScript load/clone it and attach behavior.

## Security and entitlement boundary

This rule never overrides security.

Do **not** move protected Pro/Pro+ data, private user data, server-only evidence, secret configuration or entitlement-gated payloads into static HTML just to satisfy the content rule. Authorization remains server-owned. A UI shell may be static; protected values are still fetched/rendered only after the existing authorization contract permits them.

## Runtime copy exceptions

A JavaScript string is acceptable when it is one of the following:

- a short UI state or status message
- data-derived text
- an auth/entitlement/role-dependent label
- a canonical shared component label that must be generated with the component
- a machine-readable key, route, selector, analytics event, source label or error identifier
- a verified data/catalog fallback needed for fail-safe behavior

If a new JavaScript change intentionally contains long user-facing copy or HTML, add a nearby comment containing:

`content-architecture: dynamic`

The comment must explain why the text is inherently state/data driven and cannot be owned by static HTML/partial/CMS without making the source of truth worse.

## Prohibited patterns by default

New code should not introduce these patterns without an explicit documented exception:

- long marketing/editorial HTML strings assigned to `innerHTML`
- static page sections created with `document.createElement(...)` and filled with copy at runtime
- page copy rewritten after load to override text already present in HTML
- large CSS strings assigned to `style.textContent`
- duplicate static copy in both HTML and JavaScript

## Migration order

When cleaning an existing surface:

1. Preserve behavior, access control and analytics.
2. Identify STATIC / SHARED / DYNAMIC / DATA-CMS text.
3. Move STATIC copy to the route HTML.
4. Move SHARED copy to a shared HTML partial/component source.
5. Move presentation from JS to CSS.
6. Leave only DYNAMIC and DATA-CMS binding logic in JS.
7. Add or update regression coverage.
8. Verify the page both with JavaScript working and with the static HTML inspected directly.

## Current intentional examples

- `property/js/watchdog-universal-menu.js`: shared, auth/entitlement-dependent navigation component. Runtime rendering is intentional.
- Watchdog Intelligence/data-center/scan renderers: data-derived output may remain runtime-driven, but stable scaffolds and styling should be moved out of JS when practical.
- `property/partials/paid-launch.html`: shared static launch copy/markup; JS only places it and attaches behavior.

## Review checklist

For every new or modified customer-facing JavaScript file:

- Is any sentence static copy that could live in HTML?
- Is JavaScript injecting CSS that belongs in a stylesheet?
- Is an existing HTML sentence being overwritten after load?
- Can the stable component scaffold live in HTML while JS only binds values?
- Would moving the value to HTML expose protected data or weaken entitlement behavior?
- If long runtime copy is necessary, is the `content-architecture: dynamic` exception documented with a real reason?

This document is the default rule for future Watchdog work. Deviations should be deliberate, narrow and reviewable.