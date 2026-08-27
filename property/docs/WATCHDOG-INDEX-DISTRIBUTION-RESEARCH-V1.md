# Watchdog Index Distribution Research v1

Status: **research only**  
Canonical property model: **ROBUST-v1**  
Master brand: **Watchdog**  
Geographic/longitudinal product family: **Watchdog Index**

## Purpose

This milestone establishes a governed geographic distribution layer without inventing a municipal, county, or New Jersey Watchdog Index score. It preserves score dispersion, tails, evidence coverage, ROBUST component completeness, sampling concentration, observation age, and source lineage.

A geographic Watchdog Index must not be calculated as the simple average of parcel Watchdog Scores. A higher-level score will require its own governed model and validation decision.

## Production research contract

The service-only research layer reads the latest persisted canonical `watchdog.watchdog_score` / `ROBUST-v1` observation per PAMS PIN from `public.score_observations`, then resolves geography from `public.property_lookups`.

The public on-demand score cache is intentionally excluded from the sampling frame. Search traffic is demand-selected and cannot be treated as representative geographic coverage. The run records the excluded cache-row count for lineage.

Each municipality, county and state snapshot preserves:

- p10, p25, median, p75 and p90 Watchdog Score
- IQR and p90-p10 span
- pressured and favorable tail shares using the canonical ROBUST-v1 verdict bands
- p10, p25, median, p75 and p90 evidence coverage plus low/high evidence shares
- R/O/B/U/S/T component availability and component score distributions
- property-class mix and dominant-class concentration
- county/municipality concentration at higher geographic levels
- observation vintage, run fingerprint and source/join counts
- an explicit `research_only` promotion state and promotion reasons

No geographic Index score is stored or emitted by this layer.

## 2026-08-27 production canary

The corrected production run completed at 2026-08-27 13:09 UTC with:

- 212 latest persisted canonical ROBUST-v1 observations
- 209 observations joined to the observed `property_lookups` warehouse
- 3 unjoined observations retained in run lineage
- 16 demand-selected on-demand cache rows explicitly excluded
- 21 municipality/county/state distribution snapshots

The first canary exposed a subgeography bookkeeping defect: county/state rows had dropped the underlying municipality/county labels, causing invalid 100% concentration diagnostics. That run remains recorded as failed. The corrected function preserves the source geography and generated a new completed run.

### New Jersey research snapshot

- 209 scored observations against 2,354 rows in the current observed warehouse: 8.9% warehouse share, **not statewide parcel-population coverage**
- 6 counties, 14 municipalities, 3 property classes represented
- Camden County supplies 92.8% of the scored state sample
- the largest property class supplies 97.6% of the state sample
- score p10/p25/median/p75/p90: 60 / 60 / 60 / 60 / 61
- evidence mean 71.4; evidence median 70
- O / overassessment-position evidence is available for 18 of 209 observations (8.6%)
- T / trajectory evidence is available for 0 of 209 observations

### Camden County research snapshot

- 194 scored observations against 1,444 observed warehouse rows: 13.4% warehouse share
- Winslow Township supplies 92.8% of the county sample
- the largest property class supplies 97.9% of the county sample
- score p10 through p90 are all 60
- O evidence is available for 8 of 194 observations (4.1%)
- T evidence is available for 0 of 194 observations

### Gloucester County research snapshot

- 11 scored observations against 738 observed warehouse rows: 1.5% warehouse share
- 6 municipalities represented
- largest municipality share: 36.4%
- score p10/p25/median/p75/p90: 52 / 52 / 55 / 70 / 75
- IQR 18; p90-p10 span 23
- O evidence is available for 6 of 11 observations (54.5%)
- T evidence is available for 0 of 11 observations

## Current evidence decision

**Do not promote a public municipal, county, or statewide Watchdog Index score from this sample.**

The current persisted observations are useful for testing the distribution contract but are not a certified geographic sampling frame. The state sample is heavily concentrated in Camden County, Camden is heavily concentrated in Winslow Township, property-class concentration is extreme, and trajectory evidence is absent. A single mean or weighted mean would hide those weaknesses rather than solve them.

ROBUST-v1 remains canonical for property-level Watchdog Score. Nothing in this research run justifies a property-model version change.

## Promotion prerequisites

Before a geographic Watchdog Index can leave `research_only`, the governed model review should establish and test all of the following:

1. A defensible sampling/population frame for the intended geographic level, with explicit denominator semantics.
2. Minimum sample, municipality/county breadth, property-class diversity, and anti-concentration rules.
3. Minimum evidence coverage and component-availability rules, including a decision on missing O and T evidence.
4. Distribution-aware geographic features that preserve tails and dispersion instead of averaging parcel scores naively.
5. Sensitivity analysis showing that no single municipality, property class, sparse component, or stale evidence source can dominate the result unintentionally.
6. Longitudinal stability/backtesting before Watchdog Index trend claims are enabled.
7. A versioned model specification, validation record and promotion decision separate from the canonical property ROBUST-v1 model.
8. A public presentation contract that distinguishes Watchdog Score from Watchdog Index and exposes evidence/coverage limitations clearly.

## Security and access

The research run and snapshot tables are service-only. RLS is enabled, browser roles have no table privileges, and the refresh function is `SECURITY INVOKER` with execution revoked from `public`, `anon`, and `authenticated`. This research layer does not weaken existing entitlement, auth, billing, privacy, or public-score gates.