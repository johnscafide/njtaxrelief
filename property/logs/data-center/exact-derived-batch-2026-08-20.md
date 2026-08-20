# Exact derived Data Center batch — 2026-08-20

Production authenticated release canary passed for the 13-marker exact-derived batch using control parcel `0505_824.02_12`.

- target: `workbench-derived`
- HTTP: 200
- duration: 5096 ms
- missing markers: 0
- provider-kind mismatches: 0
- value mismatches: 0
- provider kind: `derived_governed` for all 13
- bulk capability: deliberately not certified by this canary

Returned control values:

- `watchdog.constraint_stack_count`: 1
- `watchdog.attorney.land_use_exception_stack`: 1
- `watchdog.attorney.public_notice_density`: 2
- `watchdog.title.title_land_constraint_mix`: 1
- `watchdog.agent.offer_question_density`: 3
- `watchdog.contractor.site_preflight_completeness`: 100
- `watchdog.contractor.preconstruction_question_set`: 1
- `watchdog.insurance.mapped_hazard_overlap`: 3
- `watchdog.insurance.physical_record_coverage`: 100
- `watchdog.municipal.municipal_source_coverage`: 100
- `watchdog.njplus.municipal_housing_evidence_depth`: 100
- `watchdog.njplus.neighborhood_trend_freshness`: 2
- `watchdog.title.municipal_search_scope`: 100

The first dispatch timed out at the default 5-second `pg_net` transport limit before a response was returned. A fresh one-use canary identity was then dispatched with a 30-second transport timeout; the application request completed successfully in 5096 ms. The first timeout was not treated as a pass.

The temporary `tmp-boldtrail-probe` function slot was used only to host the one-use canary because the Supabase project had reached its Edge Function count limit. The slot was restored immediately afterward to its original retired 410-response implementation with JWT verification enabled.
