# Source monitor delivery

The watcher fingerprints official New Jersey publisher pages every six hours. It does not publish data automatically.

When a fingerprint changes, the GitHub workflow posts the change list to the deployed Supabase function. The function accepts only a Supabase service-role JWT, respects each saved property's Pulse preferences, and creates a private `source_refresh` event. The customer sees that Watchdog is reviewing a changed source—not a claim that their parcel has changed.

Set these GitHub Actions secrets before enabling scheduled delivery:

| Secret | Value |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | The project service-role key. Never place it in browser JavaScript. |
| `SUPABASE_SOURCE_MONITOR_URL` | `https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/source-monitor-ingest` |

First run: use the workflow with `--accept` (or run `python property/scripts/monitor_nj_sources.py --accept`) to establish a baseline. It will not create customer events. Later changed-source runs deliver idempotent alerts using a source fingerprint as the event key.

The next source-monitor phase is the review-and-refresh job: download the new edition, validate row counts and field changes, and only then publish approved metrics.
