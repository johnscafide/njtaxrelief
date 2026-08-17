# Watchdog Intelligence Phase 8 notes

Phase 8 creates the governed semantic property context used by page-native Intelligence, deterministic scenarios, and Watchdog Analyst.

## Current staging contracts

- Semantic Context engine: `watchdog-semantic-context-v6-conflict-observations`
- Semantic Snapshot contract: `watchdog-semantic-snapshot-v4`
- Observation contract: `semantic-observations-v1`
- Source authority policy: `source-authority-v1`
- Scenario engine: `watchdog-scenario-engine-v3-conflict-lineage`
- Analyst: `watchdog-analyst-v5-conflict-history`
- Analyst tool contract: `watchdog-analyst-tools-v4-conflict-history`

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

`intelligence_semantic_snapshot_cache` is service-only and fail-closed with RLS and no browser policies. Cache scope includes authenticated user, plan, property, pack set, and registry/policy version. TTL is 10 minutes.

## Scenario rule

Property tax scenarios require explicit assumptions for municipal levy growth, property assessment growth, and municipal tax-base growth. No financial assumption is invented or silently defaulted.

Current property-tax-share formula:

`projected_tax_y = current_tax × ((1 + levy_growth) × (1 + property_assessment_growth) / (1 + municipal_tax_base_growth))^y`

This output is a user-controlled scenario, not a forecast or valuation.

## Analyst rule

Factual property questions use Semantic Context. Analysis/ranking questions use deterministic model runners and then attach bounded Semantic Context. Optional AI prose may rewrite conclusion/caveats for clarity only and cannot add facts, values, probabilities, sources, or actions.

Score history follows the current global `score_observations` property/marker contract. It is not treated as private user-owned history.

## Production status

All Phase 8 acceptance described here is staging-only. Production has not been promoted.
