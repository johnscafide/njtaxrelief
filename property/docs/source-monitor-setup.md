# Source monitor delivery

The watcher checks official New Jersey publisher pages once a day. It does not publish data automatically.

The monitor keeps a timestamped source-health ledger in the private warehouse. A public page changing its rendered HTML is **not** enough to create an alert: the same publisher-provided `ETag` or `Last-Modified` token must appear on two daily checks. Confirmed changes are sent to the deployed Supabase function, which records the run and observations, respects each saved property's Pulse preferences, and creates a private `source_refresh` event. The customer sees that Watchdog is reviewing a changed source—not a claim that their parcel has changed.

Set these GitHub Actions secrets before enabling scheduled delivery:

| Secret | Value |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | The project service-role key. Never place it in browser JavaScript. |
| `SUPABASE_SOURCE_MONITOR_URL` | `https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/source-monitor-ingest` |

First run establishes a baseline automatically. A manual `python property/scripts/monitor_nj_sources.py --accept` can accept a pending token after developer review. The GitHub workflow deliberately has read-only repository permissions: it stores a 90-day artifact and writes the permanent private ledger through the Edge Function, rather than making branches, PRs, issues, or noisy commits.

The next source-monitor phase is the review-and-refresh job: download the new edition, validate row counts and field changes, archive it as a new `watchdog_warehouse.source_releases` edition, and only then publish approved metrics. `source_releases` and the publication pointer preserve current and prior validated versions so a customer can later select an "as of" date without overwriting history.
