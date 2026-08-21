# Watchdog Whitepapers

Long-form product, architecture, and research documents that describe the intended operating model behind major Watchdog systems.

## Current

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

Whitepapers describe architecture, product direction, and research bets. They do not override production security policy or code. When implementation status differs from a whitepaper, record and manage the work in Linear and update the document rather than presenting future work as shipped.
