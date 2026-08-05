# NJPTR Watchdog platform release 0.11.0

This release turns the existing Tax Rate Trajectory and Statewide Fairness Index into a shared municipal-intelligence system. It also adds the Historical Property Time Machine, secure postal ownership-verification infrastructure, live delivery diagnostics, review-first state-data automation, reliable shared-sidebar behavior, and the Pro+ Data Center specification.

## Included integrations

- Shared fairness, ranking, assessment-currency and rate-history calculation module
- Statewide Fairness Index powered by the shared module
- Shareable town report links using `fairness.html?district=XXXX`
- Municipality comparison for up to four towns
- Town Intelligence inside each property report
- Town fairness and rate indicators on Dashboard property cards
- New Dashboard sorting by fairness and rate growth
- Town context inside Dashboard property comparison
- Town signals inside Agent Intel
- Fairness, rank and trajectory columns in the Pro table and exports
- Pro portfolio municipal risk matrix
- Buyer Tax Outlook using the town's own rate history when available
- Adjustable Tax Bill Pressure Simulator
- Homepage discovery cards and sitemap entries
- Shared-menu links for Fairness Index and Compare towns
- A visual Updates & Roadmap page linked from the shared desktop and mobile menu
- A data-backed release history with changed links, files, timestamps and impact totals
- Release-impact and category charts, plus a prioritized project roadmap
- Shared sidebar expansion and collapse on Dashboard, Home, Fairness, Town Compare, Updates, and diagnostics pages
- Historical assessment and tax charts with a per-property event timeline
- Postal verification queue, salted code storage, rate limits, redemption, diagnostics, and administrator-email delivery
- Monthly state-data validation and refresh workflow that opens a pull request for review
- Source registry and freshness report covering seven data families
- Pro+ Data Center product specification and plan integration
- Shared ownership-verification module used by Lookup, Dashboard and Home
- Immediate verification choice after a property is claimed as Home, with a clear Not now path
- Municipal Budget Pressure for 564 New Jersey municipalities using 2021-2025 levy and ratable data plus the 2025 User-Friendly Budget Database
- Explainable pressure bands with levy growth, organic ratable growth, municipal/school/county components, budget growth, debt service, collections and structural imbalance
- Budget Pressure integration across Dashboard cards and sorting, Home, Agent Intel, property comparison, town reports, town comparison, exports and the future Pro+ Data Center catalog
- Exempt-property and PILOT exposure for all 564 municipalities, combining the 2025 NJ Abstract of Ratables with DCA's 2026 PILOT Database and Viewer
- Full 564-municipality repair of the partial exemption/abatement dataset
- Added/omitted assessment monitor with saved browser-private inputs, observed assessment-change signals, AA-1 explanation and working deadline guidance
- Farmland Assessment qualification screener using the current 2026 acreage, two-year-use, gross-sales, filing and woodland rules, plus rollback-tax exposure
- Dashboard property-card sizing repair so Assessed, Tax / Year, Market Value, Town Intelligence and Budget Pressure remain visible on both desktop and mobile
- Pro+ Data Center specification extended with exportable fields from all three new tools

## Keeping the tracker current

Add one release object to the top of `property/data/versions.json` whenever a release is prepared. Use an ISO 8601 timestamp with the America/New_York offset, list the user-facing links and changed files, and update `updated_at`. The Updates page reads that file automatically, so its timeline, totals and charts require no HTML edits.

Earlier work reconstructed from this project session is labeled `Time not captured in the original session`. Exact timestamps begin with release 0.8.0.

## Important verification deployment note

The web files can be uploaded normally, but postal verification also requires the included Supabase migrations and Edge Function. The function uses the existing EmailJS service and `template_verifymail` to send each secure code and mailing address to the administrator. The administrator writes or prints the code on a postcard and mails it to the property. The requester never receives the code by email. The EmailJS private key is stored only as a Supabase secret and is not included in this package.

The Data Center is documented and added to the Pro+ roadmap. It is not presented as a finished user tool in this release.

## Municipal Budget Pressure data

The eleven NJ DCA Excel files are build inputs and do not need to be uploaded to the public website. The web-ready result is `property/data/budget-pressure.json`. To refresh it in a future year, place the current DCA workbooks in a local folder and run the included `property/scripts/build_budget_pressure.py` builder, then review the generated data before publishing it.

## Exempt property and PILOT data

The public website loads only `property/data/exempt-pilot.json` and the rebuilt `property/abatements.json`; it does not need either Excel workbook. The derived file uses the 2025 Abstract of Ratables and DCA's 2026 PILOT Database and Viewer. The included `property/scripts/build_exempt_pilot.py` recreates both JSON files when new annual workbooks are available. Project-level PILOT names are intentionally not exported because the product needs municipal aggregates only.

## Added/omitted and Farmland screens

These two tools do not require a new database migration in this release. User-entered monitor/checklist answers are stored only in that browser. The Added/Omitted tool links directly to current NJ Form AA-1 and explains the Dec. 1 / 30-days-after-bulk-mailing filing rule. The Farmland tool links to the current NJ Farmland Assessment page and forms and uses the rules published by the Division of Taxation in 2026. The assessor and County Board remain the authoritative decision makers.

## Limits preserved in the interface

Fairness measures consistency within a municipality. It does not mean taxes are low and does not decide whether one property has an appeal. Tax-rate trajectory describes history. The simulator is an adjustable scenario, not a forecast.

The integration uses 558 tax districts with current uniformity data. Of those, 459 currently have enough matched rate history for a trajectory calculation.
