# Watchdog Intelligence

Watchdog Intelligence is the governed analytics and AI layer for the `/property/` SaaS platform.

## Product rule

AI is not a factual source of truth. Watchdog first resolves governed property facts, derived formulas, change history, cohort context and model results. AI may explain, summarize, compare, translate natural-language intent into approved analytical operations and suggest next actions. It may not invent property facts, silently calculate hidden values, substitute missing sources or guarantee financial outcomes.

## Architecture

1. **Truth layer** — authoritative/public property records, snapshots, source lineage and user-authorized data.
2. **Derived intelligence layer** — versioned Watchdog formulas and governed signals.
3. **Opportunity layer** — profession-specific deterministic ranking and evidence coverage.
4. **Analyst layer** — grounded narrative explanation and natural-language tool orchestration.
5. **Action layer** — cases, reports, saved lists, monitoring, CRM/direct mail/ads and outcome attribution.

## Initial customer-facing experiences

### Pro

- Why this property?
- What changed?
- What looks unusual?
- Assessment Anomaly Finder
- Closing Review Priority
- Evidence and missing-evidence drawer
- Client/professional brief generation

### Pro+

- Population-scale farm/workbench analysis
- Property Change Intelligence
- Ranked opportunity queues
- Cohort comparisons and anomaly scans
- Scenario/impact assumptions
- Daily/weekly intelligence digests
- Outcome learning and personalized ranking

## Intelligence finding contract

Every customer-facing finding must include:

- model key + model version
- Watchdog engine version
- property identifier
- deterministic score
- confidence/evidence coverage
- why-now facts
- supporting evidence with source/observed-at metadata where available
- missing evidence
- potential impact assumptions, never an AI-guaranteed outcome
- recommended next actions
- facts hash for cache/invalidation
- optional AI narrative generated only from the structured finding

## Foundation schema

The staging database now contains:

- `intelligence_models`
- `intelligence_runs`
- `intelligence_findings`
- `intelligence_feedback`
- `intelligence_assumptions`

Runs and findings are service-written and customer read-only. Feedback and assumptions are customer-owned and protected by RLS.

Seed preview models:

- `assessment_anomaly` — Pro
- `closing_review` — Pro
- `property_change_priority` — Pro+

All seed models begin in `uncalibrated` state. They must move through testing/calibration before customer-facing claims are enabled.

## Build sequence

### Milestone 1 — Foundation

Schema, model registry, evidence contract, feature branch, staging-only preview.

### Milestone 2 — Deterministic engine

Build candidate hydration, cohort context, scoring, confidence, evidence coverage, facts hashing and reproducible ranking using existing Workbench/derived-marker infrastructure.

### Milestone 3 — Workbench Intelligence UX

Add Intelligence mode, result queue, Evidence Drawer, Why Now, missing-evidence display and actions. Keep the spreadsheet/table mode intact.

### Milestone 4 — Watchdog Analyst

Add tool-gated natural-language orchestration. The model gets approved tools, not raw SQL. First tools should include property explanation, comparison, score/change history, model runs and report/list actions.

### Milestone 5 — Opportunity value + outcomes

User-controlled assumptions, expected-value scenarios, useful/not-relevant feedback and business outcomes (contacted, appointment, client, under contract, closed). Use outcomes to personalize ranking without altering source facts.

### Milestone 6 — Pro+ scale + automation

Bulk county/farm scans, change-triggered reruns, digests, caching, usage limits, cost controls, monitoring and model calibration dashboards.

## Non-negotiable guardrails

- No raw LLM SQL access.
- No protected-class or sensitive-person profiling for housing targeting.
- No fabricated public records or inferred owner characteristics.
- No AI-generated valuation/appeal/legal conclusion presented as fact.
- Every material conclusion must be traceable to structured evidence.
- Missing data must remain missing.
- Model version, formula version and source observation dates must be retained.
- Cache invalidation is driven by facts hash/model version changes.
