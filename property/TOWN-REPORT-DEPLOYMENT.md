# Statewide town reports — deployment note

This release adds public report pages at:

- `/towns/` — searchable New Jersey directory
- `/towns/{county}/` — county hubs
- `/towns/{county}/{municipality}.html` — 564 individual municipal reports

Upload the ZIP contents to the same web root as `index.html`, preserving every folder name. Do not place the contents of the `towns` folder directly in the root; the folder itself must remain `/towns/`.

The report pages are intentionally static. After a future state-data refresh, run:

```bash
python scripts/generate_town_pages.py --date YYYY-MM-DD
python scripts/verify_town_pages.py
```

Then deploy the regenerated `towns/` folder and `sitemap.xml`.

Each report is municipal-level context, not an appraisal, legal advice, or a benefit-eligibility determination.
