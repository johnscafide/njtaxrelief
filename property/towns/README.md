# New Jersey town reports

This folder is generated from the municipal data already used by Property Watchdog.

## Refreshing the reports

After updating the state data files, run this from the site root:

```bash
python scripts/generate_town_pages.py --date YYYY-MM-DD
python scripts/verify_town_pages.py
```

The generator rebuilds the 564 town reports, 21 county hubs, the all-town directory, `town-manifest.json`, and the town section of `sitemap.xml`.

The report pages use municipality-level public context only. They should not be used as an appraisal, legal opinion, or program-eligibility decision.
