# Watchdog repository instructions

Follow `docs/content-architecture.md` for every UI/content change.

Global default:

- HTML owns static human-authored page copy and static markup.
- Shared static copy/markup belongs in an HTML partial when reused.
- CSS owns presentation; do not embed large stylesheet strings in JavaScript.
- JavaScript owns behavior, runtime state, auth/entitlement-dependent UI, data-derived output and concise labels that genuinely depend on component state.
- Supabase/CMS owns governed datasets and intentionally data-managed editorial content.
- Do not add static marketing, editorial, legal, FAQ or SEO copy as runtime DOM replacement strings in `/property/js/` when it can live in HTML.
- Existing violations should be migrated incrementally without weakening auth, entitlement, RLS, billing, privacy or evidence-lineage controls.

This is a standing architecture rule, not a one-time cleanup preference. Linear: NJW-297.