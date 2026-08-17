# Watchdog Intelligence Phase 8 notes

Phase 8 creates the governed semantic property context used by page-native Intelligence, deterministic scenarios, and Watchdog Analyst.

## Current staging contracts

- Semantic Context engine: `watchdog-semantic-context-v7-direct-markers`
- Semantic Snapshot contract: `watchdog-semantic-snapshot-v5`
- Semantic packs: `semantic-packs-v1`
- Direct marker contract: `semantic-direct-markers-v1`
- Observation contract: `semantic-observations-v1`
- Source authority policy: `source-authority-v1`
- Scenario engine: `watchdog-scenario-engine-v3-conflict-lineage`
- Analyst: `watchdog-analyst-v5-conflict-history`
- Analyst tool contract: `watchdog-analyst-tools-v4-conflict-history`
- Analyst deterministic tax scenario bridge: `watchdog-analyst-scenario-v1`

## Source truth policy

Watchdog does not ask AI to choose truth.

Canonical observation order:
1. authoritative source
2. authoritative reference or spatial reference
3. trusted Watchdog observation
4. deterministic derived signal
5. other resolved value
6. missing

Competing observations are preserved. Canonical values are selected by authority rank, then recency. The losing observations remain attached to the marker and facts hash.

## Hashes

`facts_hash` represents governed values, state, source/provider identity, authority policy, observation set, and canonical selection. Retrieval timestamps are excluded.

`retrieval_hash` includes observation/check timing and may change when the same facts are refreshed.

## Semantic cache

`intelligence_semantic_snapshot_cache` is service-only and fail-closed with RLS and no browser policies. Cache scope includes authenticated user, plan, property, requested pack set or direct marker set, and registry/policy/contract version. TTL is 10 minutes.

Direct marker IDs participate in the cache identity through a stable hash of the sorted marker request. A direct-marker request cannot accidentally reuse a broader pack cache.

## Semantic packs

Named packs remain the default low-cost path for normal page context. Current packs:

- identity
- assessment_tax
- sale_market
- appeal_uniformity
- permits_closing
- environment_risk
- municipal_pressure
- agent_opportunity

Pages should request the smallest meaningful pack set rather than loading every marker.

## Direct marker rule

Any marker in the governed registry whose provider status is currently `live` or `partial` can be requested explicitly by marker ID through the same Semantic Context contract, subject to the signed-in user's plan/entitlement and the underlying governed hydrator.

Rules:

- maximum 100 explicit marker IDs per request
- combined semantic selection remains bounded to 250 markers
- when `marker_ids` are provided without `packs`, no default packs are added
- unknown marker IDs remain explicit as `unknown_marker`
- planned/unavailable markers remain explicit with their provider-state reason
- if no live/partial marker resolves, the service returns a governed 409 rather than inventing a value
- direct requests still preserve source authority, observations, conflicts, missing states, facts hash, retrieval hash and provider lineage
- optional `value_type`, `unit` and `format` metadata are included when present in the governed registry/provider metadata

The registry currently describes 734 markers, including 349 live and 5 partial markers. This does not mean all 734 have live values. Watchdog keeps planned/unavailable provider state explicit rather than pretending the data exists.

### Direct-marker staging acceptance

Known governed property `0117_10102_5` was requested with:

- `property.annual_tax`
- `property.assessed_value`
- `fake.marker.never`

Result:

- exactly 2 governed markers selected
- no semantic packs implicitly loaded
- fake marker returned as `unknown_marker`
- annual tax = $6,436.82, authoritative source, authority 100
- assessed value = $178,900, authoritative source, authority 100
- first request = cache miss
- identical repeat = cache hit
- forced refresh = cache miss
- facts hash remained exactly stable across initial, cached and forced-refresh requests

A normal `assessment_tax` pack request continued to resolve 60 markers and the same $6,436.82 annual-tax source fact, proving pack backward compatibility.

An unknown-only direct request returned 409 `No live or partial governed markers resolved` with the unresolved marker reason rather than hydrating default packs.

## Scenario rule

Property tax scenarios require explicit assumptions for municipal levy growth, property assessment growth, and municipal tax-base growth. No financial assumption is invented or silently defaulted.

Current property-tax-share formula:

`projected_tax_y = current_tax × ((1 + levy_growth) × (1 + property_assessment_growth) / (1 + municipal_tax_base_growth))^y`

This output is a user-controlled scenario, not a forecast or valuation.

Natural-language scenario requests are parsed deterministically. Explicit `unchanged`, `flat`, or `no change` language may map to 0%; any omitted financial assumption remains missing and prevents calculation.

## Analyst rule

Factual property questions use Semantic Context. Analysis/ranking questions use deterministic model runners and then attach bounded Semantic Context. Optional AI prose may rewrite conclusion/caveats for clarity only and cannot add facts, values, probabilities, sources, or actions.

Ask Watchdog property-tax scenarios use the audited deterministic scenario bridge. The language model does not parse the assumptions and does not calculate the projection.

Score history follows the current global `score_observations` property/marker contract. It is not treated as private user-owned history.

## Page-native feedback rule

Proactive Context Intelligence suggestions preserve persisted finding/run lineage. Exposure/open feedback records zero-unit telemetry. Useful, Not relevant and Dismissed feedback reuse the existing immutable Phase 5 learning/outcome path.

Feedback may influence the user's learned attention order after sufficient first-party outcomes. It never changes source facts, deterministic formulas, Watchdog scores, confidence, evidence coverage, facts hashes or historical findings.

## Production status

All Phase 8 acceptance described here is staging-only. Production has not been promoted.
