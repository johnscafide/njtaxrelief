# Watchdog Whitepapers

Long-form product, architecture, and research documents that describe the intended operating model behind major Watchdog systems.

## Current

### The Watchdog Score

Foundational methodology, governance, brand, and long-range product paper for the Watchdog Score and derived-marker system. The six-component property methodology is officially branded as the **ROBUST Framework**:

- **R** - Recourse
- **O** - Overassessment Position
- **B** - Burden
- **U** - Uniformity
- **S** - Stability
- **T** - Trajectory

**Watchdog Score** remains the product/result; **ROBUST Framework** is the branded methodology and explanatory system underneath it. The paper covers the current property tax-position weights, evidence and confidence rules, canonical score versioning, geographic expansion from property to municipality/county/state, longitudinal Score + Confidence + Momentum, civic and political neutrality, fair-housing safeguards, anti-gaming controls, research validation, brand governance, and the 5–10 year distribution strategy:

[`WATCHDOG-SCORE-MARKERS-WHITEPAPER.md`](./WATCHDOG-SCORE-MARKERS-WHITEPAPER.md)

Primary related roadmap:

- Linear `NJW-270` - canonical Watchdog Score, ROBUST Framework, geographic hierarchy, validation and distribution standard.
- Linear `NJW-102` - canonical municipal-score re-scope and legacy peer-score cleanup.
- Linear `NJW-106` - flagship derived-marker methodology coverage.
- Linear `NJW-192` - deterministic scoring, evidence, cohorts and calibration architecture.
- Linear `NJW-144`, `NJW-208`, `NJW-210`, `NJW-249` - marker governance, score history and outcome validation dependencies.

### Watchdog Intelligence Voice

Living whitepaper covering governed speech, contextual conversation, narrated intelligence, safe spoken commands, plan packaging, browser/provider architecture, privacy, telemetry, accessibility, and future voice-triggered automation:

[`WATCHDOG-INTELLIGENCE-VOICE-WHITEPAPER.md`](./WATCHDOG-INTELLIGENCE-VOICE-WHITEPAPER.md)

Primary roadmap:

- Linear `NJW-263` - shipped Voice v1 foundation.
- Linear `NJW-265` - contextual Voice, spoken workflows, multimodal controls, and vNext research.

### Watchdog Automation Fabric: Zapier + Watchdog Intelligence

Living whitepaper and future integration manual:

[`WATCHDOG-ZAPIER-INTELLIGENCE-WHITEPAPER.md`](./WATCHDOG-ZAPIER-INTELLIGENCE-WHITEPAPER.md)

Voice is treated as a governed intent channel into this automation architecture, not as a second automation stack. The dedicated Voice paper defines the speech-specific trust model and command taxonomy.

Architecture illustrations:

- [`zapier-watchdog-nervous-system.svg`](./assets/zapier-watchdog-nervous-system.svg)
- [`zapier-watchdog-trust-boundary.svg`](./assets/zapier-watchdog-trust-boundary.svg)
- [`zapier-watchdog-inbound-orchestration.svg`](./assets/zapier-watchdog-inbound-orchestration.svg)
- [`zapier-watchdog-moonshot-fabric.svg`](./assets/zapier-watchdog-moonshot-fabric.svg)

## Governance

Whitepapers describe architecture, product direction, research bets, and governed brand language. They do not override production security policy or code. When implementation status differs from a whitepaper, record and manage the work in Linear and update the document rather than presenting future work as shipped.
