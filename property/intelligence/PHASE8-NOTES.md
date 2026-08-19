# Watchdog Intelligence Phase 8 notes

Phase 8 is the governed semantic property context used by page-native Intelligence, deterministic scenarios, Watchdog Analyst, and the visible Property Data Graph.

## Current contracts

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

Competing observations are preserved. Canonical values are selected by authority rank, then recency. Losing observations remain attached to the marker and facts hash.

## Hashes

`facts_hash` represents governed values, state, source/provider identity, authority policy, observation set, and canonical selection. Retrieval timestamps are excluded.

`retrieval_hash` includes observation/check timing and may change when the same facts are refreshed.

## Semantic cache

`intelligence_semantic_snapshot_cache` is service-only and fail-closed with RLS and no browser policies. Cache scope includes authenticated user, plan, property, requested pack set or direct marker set, and registry/policy/contract version. TTL is 10 minutes.

Direct marker IDs participate in the cache identity through a stable hash of the sorted marker request. A direct-marker request cannot accidentally reuse a broader pack cache.

## Semantic packs

Named packs remain the default bounded path for normal page context:

- identity
- assessment_tax
- sale_market
- appeal_uniformity
- permits_closing
- environment_risk
- municipal_pressure
- agent_opportunity

Pages should request the smallest meaningful pack set for their job. The visible Property Data Graph is a deliberate exception that lazy-loads a broad cross-domain graph view only when the user approaches that section.

## Direct marker rule

Any marker in the governed registry whose provider status is `live` or `partial` can be requested explicitly by marker ID through the same Semantic Context contract, subject to the signed-in user's plan/entitlement and the governed hydrator.

Rules:

- maximum 100 explicit marker IDs per request
- combined semantic selection remains bounded to 250 markers
- when `marker_ids` are provided without `packs`, no default packs are added
- unknown marker IDs remain explicit as `unknown_marker`
- planned/unavailable markers remain explicit with their provider-state reason
- if no live/partial marker resolves, the service returns a governed 409 rather than inventing a value
- direct requests preserve source authority, observations, conflicts, missing states, facts hash, retrieval hash and provider lineage
- optional `value_type`, `unit` and `format` metadata are included when present in the governed registry/provider metadata

The checked-in registry currently describes 734 marker definitions. Runtime responses report the current registry total and live/partial provider counts. Registry size is never represented as the number of facts available for an individual property.

## Property Data Graph rule

Property Home may expose the governed chain as:

`registry -> selected property context -> source lineage -> deterministic derived layer -> persisted Intelligence models/findings -> governed actions`

The graph must obey these rules:

- count only markers whose semantic state is actually `available` as resolved property data
- display selected-marker count separately from available-marker count
- display registry universe separately from property-level evidence
- keep source facts/references, trusted observations, derived signals and other resolved values visibly distinct
- count source families from resolved marker lineage, not marketing claims
- count models/findings only from persisted `intelligence_runs` / `intelligence_findings` visible to the authenticated user
- count actions only from persisted finding `recommended_actions`
- preserve conflict count, authority-policy version and semantic-contract version
- refuse placeholder counts when governed semantic context cannot resolve
- lazy-load the broad graph request near the viewport to avoid turning a trust visualization into a Property Home performance penalty

## Historical direct-marker acceptance

A staging acceptance run used known governed property `0117_10102_5` with `property.annual_tax`, `property.assessed_value`, and an intentionally fake marker. The two real markers resolved as authoritative source facts, the fake marker remained explicitly unresolved, cache behavior was verified, and facts hash remained stable. This historical test remains useful evidence of the direct-marker contract; it is not a current-property claim.

## Scenario rule

Property-tax scenarios require explicit assumptions for municipal levy growth, property assessment growth, and municipal tax-base growth. No financial assumption is invented or silently defaulted.

Current property-tax-share formula:

`projected_tax_y = current_tax × ((1 + levy_growth) × (1 + property_assessment_growth) / (1 + municipal_tax_base_growth))^y`

This output is a user-controlled scenario, not a forecast or valuation.

Natural-language scenario requests are parsed deterministically. Explicit `unchanged`, `flat`, or `no change` language may map to 0%; any omitted financial assumption remains missing and prevents calculation.

## Analyst rule

Factual property questions use Semantic Context. Analysis/ranking questions use deterministic model runners and then attach bounded Semantic Context. Optional AI prose may rewrite conclusions/caveats for clarity only and cannot add facts, values, probabilities, sources, or actions.

Ask Watchdog property-tax scenarios use the audited deterministic scenario bridge. The language model does not parse the assumptions and does not calculate the projection.

## Page-native feedback rule

Proactive Context Intelligence suggestions preserve persisted finding/run lineage. Exposure/open feedback records zero-unit telemetry. Useful, Not relevant and Dismissed feedback reuse the existing immutable learning/outcome path.

Feedback may influence learned attention order after sufficient first-party outcomes. It never changes source facts, deterministic formulas, Watchdog scores, confidence, evidence coverage, facts hashes or historical findings.

## Production status

Phase 8 semantic context and its production-eligible Intelligence runtime were promoted during the authorized Watchdog Intelligence launch on August 18, 2026. The customer-facing Intelligence release is live subject to plan entitlements and model calibration status. This file no longer treats the production system as staging-only.
