# NJW-135 — Search Console measurement and pruning policy

Repository-side guardrails are automated by `.github/workflows/seo-content-guard.yml`. Google Search Console itself requires access to the verified property and therefore is an account-side measurement step.

## Submit / monitor these sitemap clusters
- `/sitemap.xml`
- `/sitemap-content.xml`
- `/sitemap-plays.xml`
- `/sitemap-glossary.xml`

## Review cadence
Weekly during the first 90 days after a new cluster launches; monthly once stable.

Track per cluster and landing page:
- indexed / excluded status
- impressions
- clicks
- CTR
- average position
- non-brand queries earning impressions
- conversion or activation events from NJW-88

## 90-day improve-or-prune rule
For an indexable programmatic page with 90+ days of opportunity:
- **0 impressions + no defensible unique value:** consolidate, redirect, or noindex.
- **Impressions but weak CTR:** improve title, description and search-intent match before creating more pages.
- **Average position ~8–30 with relevant queries:** add unique evidence, source detail, worked examples and internal links.
- **Duplicate query intent:** consolidate to the stronger canonical URL.
- **Useful to signed-in users but not useful in search:** keep the product surface and noindex it.

Never keep a thin page indexed merely because it can be generated cheaply.
