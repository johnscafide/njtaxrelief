# Pro+ Data Center product specification

## Product promise

The Data Center is the all-encompassing Pro+ workspace for every property, municipality, county, state-source, and Watchdog-derived field the platform creates. A user chooses a scope, checks the categories or individual fields they need, and each choice is added immediately as a column in one large working sheet.

## Core layout

- Left filter catalog: searchable groups with checkboxes, selected counts, select-all, clear, and saved presets.
- Scope bar: one property, saved list, municipality, county, uploaded address list, or permitted statewide job.
- Main data sheet: sticky identity columns, sortable and resizable selected columns, column grouping, pagination or row virtualization, and data-quality indicators.
- Selection tray: selected fields shown in order with drag-to-reorder and remove controls.
- Actions: save view, duplicate view, CSV/XLSX export, scheduled delivery, API payload preview, and permitted CRM handoff.

## Initial field catalog

1. Parcel identity: address, PAMS PIN, county, municipality, block, lot, qualifier, property class.
2. Assessment and tax: land, improvement, total assessment, tax bill, effective rate, general rate, ratio year.
3. Valuation and Chapter 123: supported market value, lower limit, upper limit, appeal flag, estimated excess, estimated annual dollars at stake.
4. Verified sales: last usable sale, sale date, square feet when published, year built when published, town verified-sale ratio, median price and price per square foot.
5. Town Intelligence: Fairness Index, statewide rank, coefficient of deviation, assessment currency, rate trajectory, revaluation pressure, class mix, abatement exposure.
6. Appeal intelligence: county filings, success rate, residential filings, evidence readiness.
7. Watchdog history: first observed, last observed, snapshot count, assessment change, tax change, latest change date.
8. Workflow: saved status, verification level, report links, notes, tags, assigned team member, last export.
9. Municipal budget pressure: pressure score and band, total levy growth, organic ratable growth, levy-to-ratable gap, school/municipal/county levy shares and growth, municipal appropriation growth, debt-service share, collection rate, structural-imbalance share, source year and formula version.
10. Exempt property & PILOT exposure: assessed value including exempt property, ordinary taxable base, fully exempt value/share, non-PILOT exempt value, PILOT count, PILOT assessed value/share, PILOT billing, conventional-tax comparison, DCA municipal subsidy, subsidy-to-budget share, partial-abatement value/share, source years and coverage flags.
11. Added/omitted monitor: monitor status, observed assessment-change signal, recent-construction signal, user-entered improvement flag, notice type, notice date, added/omitted amount, working appeal deadline, AA-1 source version, and availability status. Browser-private entries remain excluded from bulk export until account-synced storage is intentionally added.
12. Farmland assessment: screening status, actively devoted acres, agricultural/woodland use type, entered gross sales, required gross-sales threshold, two-year-use check, continued-use check, woodland-plan check, under-seven-acre narrative check, next FA-1 filing deadline, target tax year and rule-source version. Browser-private qualification inputs remain excluded from bulk export until account-synced storage is intentionally added.

Every future tool must register its exportable fields in the Data Center field catalog as part of its definition of done.

## Data and safety rules

- No owner names are ever available or added. The product cannot become person-searchable.
- It is not a consumer report and cannot be used for tenant, employment, insurance, or credit screening.
- Public records do not reliably publish condition, renovation history, deferred maintenance, bedrooms, or bathrooms. Those fields must not be inferred and presented as state facts.
- Every computed field carries source, effective date, formula version, and availability status.
- Google imagery is viewed live only and never exported or cached.

## Architecture

- Field registry JSON defines key, label, group, tier, type, source, formatter, dependencies, and export permission.
- Query planner requests only dependencies required by selected fields.
- Worker-backed jobs handle large county, statewide, and uploaded-list scopes.
- Virtualized table renders large results without inserting every cell into the page at once.
- Saved views store scope rules and selected field keys, not copied source data.
- Export jobs are immutable, timestamped, and attached to the source-version manifest used to create them.

## Delivery phases

1. Saved-property sheet and field registry.
2. Town and county scopes with server-side query jobs.
3. Upload, enrichment, presets, XLSX, and scheduled delivery.
4. API payload builder, webhooks, team roles, and governed statewide jobs.
