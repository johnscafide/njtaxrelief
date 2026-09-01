# Watchdog Content Glossary

The Content Glossary is the searchable source map for human-facing Watchdog text. It complements `docs/CONTENT_ARCHITECTURE.md` by answering a practical question: **“Where does this exact wording live?”**

## Developer UI

Open `/developer/content-glossary` while signed in with the Watchdog developer role. Search any phrase, label, placeholder, file name, or ownership layer. Results show the owning file, approximate source line, content class, and edit guidance.

## Ownership

- **HTML** — static page copy, headings, CTA wording, FAQs, disclosures, accessibility labels and other ordinary editable text.
- **JavaScript** — runtime/shared/state/data text. Treat edits with caution because surrounding behavior may depend on the string. Ordinary static marketing/editorial copy should still move to HTML, partials, or governed content.
- **DATA** — intentionally repo-backed structured copy used by repeated/data-driven surfaces. This is currently limited to explicit content sources such as `property/data/county-copy.json`, `property/data/current-update.json`, and `property/data/versions.json`; it does not make raw datasets a copy layer.
- **CMS** — governed database-backed editorial content. The glossary stores source pointers only, never private production rows. Production currently includes the governed `public.insights_articles` source.
- **CSS** — presentation only; CSS is intentionally not indexed as copy.

The global content rule remains unchanged: ordinary static page prose belongs in HTML/partials. Structured DATA is for deliberate repeated content contracts, not a general alternative to HTML.

## Freshness model

The glossary is generated from the exact repository state during the Vercel build with `npm run content-glossary:generate`. It is not a manually maintained list, so the deployed glossary cannot drift from the commit that produced it. CI runs the scanner when relevant HTML, JavaScript, or allowlisted structured-copy files change and validates the generated artifact and secret-safety rules.

## Scanner boundaries

`scripts/generate-content-glossary.mjs` scans HTML under `property/`, JavaScript under `property/js/`, and the explicit structured-copy JSON allowlist. It ignores vendor/build/generated directories, script/style/SVG bodies in HTML, obvious URLs/selectors/file names, token-like strings, and sensitive credential patterns. Raw property/provider datasets are intentionally excluded. Supabase/CMS sources are represented by metadata pointers rather than copied production rows.

When a new repo-backed structured content source is introduced, add it deliberately to `STRUCTURED_COPY_FILES` in the generator and to `.github/workflows/content-glossary-contract.yml` so freshness checks follow that source.

Generated output: `property/developer/content-glossary/glossary.json` (created during build; do not hand-edit).
