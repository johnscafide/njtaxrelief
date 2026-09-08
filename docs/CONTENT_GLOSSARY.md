# Watchdog Content Glossary

The Content Glossary is the searchable source map for human-facing Watchdog text. It complements `docs/CONTENT_ARCHITECTURE.md` by answering a practical question: **“Where does this exact wording live?”**

## Public copy standard

Customer-facing Watchdog copy should be short, natural and useful. The interface should explain what something is, what it means and what the user can do next. It should not explain internal implementation unless that detail is required to use the feature safely or correctly.

Use these rules across public, signed-in and paid customer surfaces:

- Lead with the task, result or action.
- Prefer a clear title, useful visual and short supporting sentence over multiple explanatory paragraphs.
- Remove implementation language such as `server-authoritative`, `server-side`, `resolver`, `normalization`, `lineage`, `runtime`, `facts hash`, `pipeline`, `RLS`, `webhook`, provider migration details and similar engineering terms from normal customer copy.
- Prefer `source`, `evidence`, `confidence`, `missing data`, `result` and `next action` when those concepts matter to the user.
- Keep necessary New Jersey domain terms such as Chapter 123, equalization ratio, COD, assessment, SR-1A and tax district when they are relevant to the task.
- Do not overstate results. Keep concise qualifiers where a feature is a screen, estimate, preview or research aid rather than a determination.
- Do not use em dashes in public prose. Use a period, comma, colon or separate sentence instead.
- Avoid slogans, dramatic phrasing and repeated restatements when a direct sentence will do.
- Buttons should say what happens next: `Search`, `Save`, `Compare plans`, `Run scan`, `Create report`, `Manage billing`.
- Error and empty states should state the problem and the next useful action. Do not describe fallback architecture or internal failure handling.

### Preferred public terminology

| Prefer | Avoid in normal customer copy |
| --- | --- |
| Watchdog Intelligence | governed Intelligence, intelligence engine |
| Supporting evidence | governed evidence, evidence lineage |
| Source | provider lineage, provenance, resolver |
| Confidence | calibration plumbing, normalization state |
| Missing data | missingness |
| Property changes | deterministic change events |
| Current plan | entitlement state |
| Manage billing | billing provider management |
| Preview | uncalibrated runtime/model language |
| Check / Review / Analyze | resolve server-side / execute governed workflow |

Technical integration pages may use API, authentication, scope and endpoint terminology when that information is necessary to complete the integration. Developer-only pages may keep implementation terminology because they are not customer surfaces.

## Canonical plan names

Use these customer-facing plan names consistently:

- **Free**
- **Agent**
- **Pro**
- **Pro+**
- **Teams**

Use **Developer** only on internal developer surfaces or when an authorized developer is viewing their own access state.

## Developer UI

Open `/developer/content-glossary` while signed in with the Watchdog developer role. Search any phrase, label, placeholder, file name, or ownership layer. Results show the owning file, approximate source line, content class, and edit guidance.

## Ownership

- **HTML**: static page copy, headings, CTA wording, FAQs, disclosures, accessibility labels and other ordinary editable text.
- **JavaScript**: runtime, shared, state and data-dependent text. Treat edits with caution because surrounding behavior may depend on the string. Ordinary static marketing or editorial copy should still move to HTML, partials or a deliberate content source.
- **DATA**: intentionally repo-backed structured copy used by repeated or data-driven surfaces. This is currently limited to explicit content sources such as `property/data/county-copy.json`, `property/data/current-update.json`, and `property/data/versions.json`. Raw datasets are not a copy layer.
- **CMS**: governed database-backed editorial content. The glossary stores source pointers only, never private production rows. Production currently includes the `public.insights_articles` source.
- **CSS**: presentation only. CSS is intentionally not indexed as copy.

The global content rule remains unchanged: ordinary static page prose belongs in HTML or partials. Structured DATA is for deliberate repeated content contracts, not a general alternative to HTML.

## Freshness model

The glossary is generated from the exact repository state during the Vercel build with `npm run content-glossary:generate`. It is not a manually maintained list, so the deployed glossary cannot drift from the commit that produced it. CI runs the scanner when relevant HTML, JavaScript or allowlisted structured-copy files change and validates the generated artifact and secret-safety rules.

## Scanner boundaries

`scripts/generate-content-glossary.mjs` scans HTML under `property/`, JavaScript under `property/js/`, and the explicit structured-copy JSON allowlist. It ignores vendor, build and generated directories, script, style and SVG bodies in HTML, obvious URLs, selectors and file names, token-like strings, and sensitive credential patterns. Raw property and provider datasets are intentionally excluded. Supabase and CMS sources are represented by metadata pointers rather than copied production rows.

When a new repo-backed structured content source is introduced, add it deliberately to `STRUCTURED_COPY_FILES` in the generator and to `.github/workflows/content-glossary-contract.yml` so freshness checks follow that source.

Generated output: `property/developer/content-glossary/glossary.json` (created during build; do not hand-edit).
