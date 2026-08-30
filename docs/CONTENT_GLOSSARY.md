# Watchdog Content Glossary

The Content Glossary is the searchable source map for human-facing Watchdog text. It complements `docs/CONTENT_ARCHITECTURE.md` by answering a practical question: **“Where does this exact wording live?”**

## Developer UI

Open `/developer/content-glossary` while signed in with the Watchdog developer role. Search any phrase, label, placeholder, file name, or ownership layer. Results show the owning file, approximate source line, content class, and edit guidance.

## Ownership

- **HTML** — static page copy, headings, CTA wording, FAQs, disclosures, accessibility labels and other ordinary editable text.
- **JavaScript** — runtime/shared/state/data text. Treat edits with caution because surrounding behavior may depend on the string.
- **CMS** — governed database-backed editorial content. The glossary stores source pointers only, never private production rows.
- **CSS** — presentation only; CSS is intentionally not indexed as copy.

## Freshness model

The glossary is generated from the exact repository state during the Vercel build with `npm run content-glossary:generate`. It is not a manually maintained list, so the deployed glossary cannot drift from the commit that produced it. CI runs the scanner on relevant HTML/JavaScript changes and validates the generated artifact and secret-safety rules.

## Scanner boundaries

`scripts/generate-content-glossary.mjs` scans HTML under `property/` and JavaScript under `property/js/`. It ignores vendor/build/generated directories, script/style/SVG bodies in HTML, obvious URLs/selectors/file names, token-like strings, and sensitive credential patterns. The result is intentionally a discovery index, not a substitute for code review.

Generated output: `property/developer/content-glossary/glossary.json` (created during build; do not hand-edit).
