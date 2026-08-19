# Watchdog Intelligence Density Doctrine

Status: active product doctrine

Watchdog Intelligence earns attention through judgment quality, not screen area. The interface should feel unusually precise, useful, and difficult to replace without turning every page into an Intelligence dashboard.

## Default rule

Use an immersive Intelligence surface only when the user explicitly entered an Intelligence-first task such as Watchdog Analyst, Daily Intelligence, Data Center, Scanner, calibration, or a focused research workflow.

On supporting product surfaces such as Dashboard, Property Home secondary areas, Account, plan, utility, and workflow pages, default to a compact decision brief.

A compact brief should present, in this order:

1. One concise conclusion or decision signal.
2. The one to three strongest evidence-backed reasons.
3. One best next action.
4. Confidence, evidence coverage, missing-evidence, freshness, and source context only where they materially improve the decision.
5. Full reasoning and source evidence behind progressive disclosure.

## Ranking before volume

Watchdog should prefer fewer recommendations with stronger ranking. A long list is not more intelligent merely because more model output exists.

Supporting surfaces should normally show the highest-ranked current finding. Additional current findings belong behind a queue or disclosure action unless the workflow itself is explicitly a triage queue.

Do not repeat the same recommendation in multiple adjacent cards or restate the same conclusion as separate Financial, Motivation, Innovation, Evidence, and Next Action blocks when a compact decision brief can preserve the important information.

## Power without takeover

Compact does not mean vague. A short Watchdog recommendation should still answer:

- What matters?
- Why does it matter here?
- What evidence supports it?
- What is missing or uncertain?
- What should I do next?

The user should be impressed by the specificity and usefulness of the decision, not by the amount of prose.

## Progressive disclosure

Evidence is never removed to create visual simplicity. It moves behind deliberate disclosure:

- Inspect reasoning
- Why Watchdog?
- Review all current suggestions
- Open evidence
- Open Property Home / Workbench / Intelligence Hub

The compact layer is a prioritization interface over governed evidence, not a replacement for evidence lineage.

## Surface modes

### Compact supporting mode

Default for Dashboard and Property Home supporting Intelligence.

- One ranked finding visible.
- One to three concise reasons.
- One next-action statement.
- Supporting prose visually bounded.
- Additional findings behind the queue.
- Full Analyst reasoning collapsed by default.

### Immersive task mode

Allowed when Intelligence is the user's explicit task.

Examples: dedicated Intelligence Hub, Daily Intelligence / Today triage, Data Center, Scanner, calibration review, and a Workbench Intelligence drawer the user deliberately opened.

Immersive mode may show richer evidence, multiple findings, models, comparisons, controls, and explanation because that is the primary job on the screen.

## Trust boundaries

Density must never hide a material limitation. Preview calibration state, limited evidence, missing evidence, source conflict, stale data, or an unavailable provider remains explicit when it changes how a reasonable user should interpret the recommendation.

Compact UI must not convert a hypothesis into a fact, imply seller intent, manufacture urgency, imply a valuation, promise ROI, create a legal conclusion, or suppress source uncertainty.

## Engineering contract

The production density runtime is `property/js/watchdog-intelligence-density.js` with presentation rules in `property/css/watchdog-intelligence-density.css`.

The CI contract is `property/tests/intelligence-density-contract.mjs`.

No Intelligence density asset may use `?v=` query-string versioning.
