# Watchdog content architecture

This rule applies globally to Watchdog code and is the default for all future work.

## Core ownership rule

**HTML owns static human-authored content. CSS owns presentation. JavaScript owns behavior and runtime state. Supabase/CMS owns governed data and publishable content collections.**

### HTML

Put content in HTML when a person should be able to open the page and edit the words directly. This includes:

- page headings and subheadings
- marketing and conversion copy
- explanatory paragraphs
- static CTA wording
- FAQ answers
- SEO/AEO copy
- legal or disclosure copy
- static empty-state/help copy that does not depend on runtime state

When the same static markup is shared across many pages, use a shared HTML partial rather than duplicating it.

### CSS

CSS owns visual presentation. Do not place large stylesheet strings in JavaScript. Runtime style changes should normally be implemented by toggling classes or CSS custom properties.

Small emergency compatibility shims may remain in JavaScript only when documented and bounded for later removal.

### JavaScript

JavaScript owns application behavior and state, including:

- event handling and interactions
- auth and entitlement-dependent UI
- data-derived labels and values
- loading/error/success states
- runtime card/list/table generation
- personalization
- analytics events
- component orchestration

Concise labels may live with a truly dynamic shared component when keeping them in HTML would create multiple conflicting sources of truth. This exception must not be used to hide page marketing/editorial copy inside JS.

### Supabase / CMS

Use governed storage for content that is intentionally managed as data rather than page source, including editorial collections such as Insights, customer-owned data, generated intelligence and other server-owned records.

## Prohibited regression pattern

Do not introduce static marketing, editorial, legal or SEO copy through runtime DOM patches such as large `innerHTML`, `textContent`, `insertAdjacentHTML`, template-string or `document.write` payloads in `/property/js/` when that content could exist in HTML.

Do not combine long CSS strings, static HTML structure, marketing copy and behavior in one JavaScript file.

## Migration rule for existing code

Existing violations are migrated incrementally to avoid regressions:

1. Preserve behavior and access boundaries first.
2. Move static copy to the owning page or shared HTML partial.
3. Move embedded presentation to CSS.
4. Leave only behavior/state logic in JS.
5. Verify auth, entitlement, billing, privacy, RLS and evidence-lineage behavior after migration.

A cleanup is not a visual redesign unless separately scoped.

## Review checklist

Before merging a Watchdog UI change, confirm:

- Could the user reasonably want to edit this sentence manually? If yes, prefer HTML/CMS.
- Is this wording determined by runtime data, auth, entitlement or application state? If yes, JS/component ownership may be appropriate.
- Is styling expressed as CSS rather than a JavaScript stylesheet string?
- Is shared static markup centralized as a partial rather than duplicated?
- Did the change preserve server-owned authorization and governed data boundaries?

Tracked under Linear NJW-297.