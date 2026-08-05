# NJPTR Watchdog platform release 0.9.3

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

## Keeping the tracker current

Add one release object to the top of `property/data/versions.json` whenever a release is prepared. Use an ISO 8601 timestamp with the America/New_York offset, list the user-facing links and changed files, and update `updated_at`. The Updates page reads that file automatically, so its timeline, totals and charts require no HTML edits.

Earlier work reconstructed from this project session is labeled `Time not captured in the original session`. Exact timestamps begin with release 0.8.0.

## Important verification deployment note

The web files can be uploaded normally, but postal verification also requires the included Supabase migrations and Edge Function. The function uses the existing EmailJS service and `template_verifymail` to send each secure code and mailing address to the administrator. The administrator writes or prints the code on a postcard and mails it to the property. The requester never receives the code by email. The EmailJS private key is stored only as a Supabase secret and is not included in this package.

The Data Center is documented and added to the Pro+ roadmap. It is not presented as a finished user tool in this release.

## Limits preserved in the interface

Fairness measures consistency within a municipality. It does not mean taxes are low and does not decide whether one property has an appeal. Tax-rate trajectory describes history. The simulator is an adjustable scenario, not a forecast.

The integration uses 558 tax districts with current uniformity data. Of those, 459 currently have enough matched rate history for a trajectory calculation.
