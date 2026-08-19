# Watchdog Brand Center

This folder is the authoritative internal handoff for Watchdog branding, product UI, editorial voice, and design-system behavior.

## Audience

- Web developers and product engineers
- Product, UI, and UX designers
- Graphic designers and marketing designers
- Copywriters and content editors
- Contractors and agencies
- LLMs and coding agents working on Watchdog

## Files

- `index.html` — developer-only visual brand center.
- `brand-center.css` — styles for the internal brand center itself.
- `brand-center.js` — protected-page reveal, copy helpers, and machine-spec status.
- `brand-system.json` — machine-readable source of truth for tokens and implementation rules.
- `LLM-BRAND-GUIDE.md` — concise instructions to place in context before another LLM edits Watchdog.

## Authority order

When sources conflict, use this order:

1. `brand-system.json`
2. `LLM-BRAND-GUIDE.md`
3. The visual examples on `/property/branding/`
4. Current shared system files, especially `/property/css/app-shell-2027.css`
5. Legacy page-level CSS

Do not copy a one-off legacy page merely because it exists. Existing pages contain multiple generations of design work.

## Core visual direction

Watchdog should feel like a modern property-intelligence product: precise, quiet, trustworthy, data-first, and premium without looking ornamental. The UI should be calm enough for dense professional information and simple enough for a homeowner using the product for the first time.

The default visual language is:

- light neutral canvas
- white surfaces
- deep navy ink
- Watchdog blue as the main action color
- restrained semantic green / amber / red
- Plus Jakarta Sans for display and Inter for product UI/body text
- subtle borders and shadows rather than heavy card chrome
- rounded geometry, generally 8–18px
- strong information hierarchy and generous whitespace
- purposeful animation only

## Governance

Any change to a canonical brand token should update both the visual page and `brand-system.json` in the same commit. Page-specific exceptions should be documented rather than silently becoming a second design system.

New CSS or JS references created for this system should use stable filenames without `?v=` query-string versioning.

## Access

`/property/branding/` declares `data-access-require="developer"` and loads `/property/js/access-guard.js`. The route is intended for authenticated Watchdog developers only and is marked `noindex, nofollow`.

Because the GitHub repository itself is public, repository files are not confidential. Do not store unreleased credentials, private customer information, licensed third-party assets, or confidential vendor material here.
