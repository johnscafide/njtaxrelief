# Agent Opportunity Desk

## Product promise

**Know which relationships in your farm have a real property reason to hear from you this week, why it matters, and what useful conversation to start.**

This is property-triggered relationship intelligence. It is not a list of people that Watchdog claims are likely to sell.

## Who it is for

- An agent who uploads or selects addresses from a sphere, past-client list, geographic farm, or saved-property collection they are permitted to contact.
- A team leader who needs a repeatable, sourced weekly prospecting workflow.
- A broker who wants measurable outreach based on property events instead of generic scripts.

## Core workflow

1. Select a town/farm or import an existing sphere with address and internal contact ID.
2. Watchdog matches addresses to parcels and refreshes authoritative sources.
3. Each property receives zero or more sourced **touch reasons**.
4. The desk ranks `Now`, `This week`, and `Watch` queues.
5. Each card explains the reason, confidence, source date, homeowner-safe language, and next action.
6. The agent can open the property, add it to a watchlist/case, copy a conversation starter, snooze it, or record an outcome.
7. The performance panel reports touches, replies, valuation requests, appointments, and listings—not vanity “lead” counts.

## Focus rules

- The opening view contains at most ten properties and only the highest-value reason for each one.
- Routine source-monitor refreshes are operations data, not agent opportunities, and never enter the desk or weekly digest.
- Repeated events are combined into the latest or highest-scoring reason for the same property and reason type.
- Longer queues render twelve records at a time.
- A parcel-matched card deep-links to the saved property workspace. Address lookup is only a fallback for an unmatched imported address.
- When a sphere property has no material event, Watchdog may offer a clearly labeled current-record review. It must never describe that fallback as a change or a seller signal.

## Initial touch reasons

| Signal | Useful conversation | Required source |
| --- | --- | --- |
| Material assessment increase | Offer to explain what changed and whether it tracks the town | MOD-IV history |
| Material tax-bill increase | Walk through the new annual carrying cost | MOD-IV/tax history |
| Independently testable Chapter 123 position | Offer a sourced assessment review | SR1A or independent comparable evidence |
| Approaching appeal deadline | Prevent a homeowner from missing the review window | NJ/municipal deadline data |
| Town revaluation or reassessment | Explain what the reset may change | Municipal/state notice |
| Permit lifecycle change | Discuss how work may affect value, marketing, or assessment | NJ DCA/municipal permits |
| Recent recorded transfer | Offer a post-closing tax and assessment check-in | MOD-IV/deed record |
| Neighborhood verified-sale movement | Share a factual local-market update | SR1A verified sales |
| Long ownership tenure | Offer an updated property/tax review without implying sale intent | Recorded transfer history |
| Tax-relief eligibility deadline | Provide a useful homeowner service reminder | NJ Treasury program guidance |

## Opportunity score

The score ranks the usefulness and urgency of a touch. It does not predict a transaction.

`touch_score = freshness (25) + magnitude (30) + evidence confidence (25) + relationship relevance (20)`

- **Freshness:** how recently the source changed.
- **Magnitude:** whether the financial/property change is material.
- **Evidence confidence:** authoritative source, match quality, and independent support.
- **Relationship relevance:** past client, claimed home, explicitly watched property, or selected farm.

Every score must expose its components, source links, observation date, and a plain-language explanation.

## Product boundaries

- Do not label a property owner a seller, distressed, motivated, or likely to move from public-record signals alone.
- Do not harvest or expose protected owner identities, including Daniel's Law-protected records.
- Do not use protected-class, credit, health, family, or similarly sensitive attributes for targeting.
- Do not represent Watchdog scores as consumer reports, appraisals, legal advice, or guaranteed appeal outcomes.
- Do not automate calls, texts, or email without the agent's lawful contact basis and required consent.
- First-party homeowner actions (valuation request, selling timeline, saved search) may be shown as intent only when explicitly submitted and attributed.

## Recommended packaging

| Plan | Price hypothesis | Included workload |
| --- | ---: | --- |
| Free | $0 | Individual property lookup and limited watchlist |
| Agent | $49/month | 250 matched sphere/farm addresses, weekly Opportunity Desk, sourced scripts |
| Agent Growth | $99/month | 1,000 addresses, daily alerts, CSV/CRM export, outcome analytics |
| Professional | $349/month | Appeal scanner, bulk evidence workflows, case workspace, professional exports |
| Firm / Data | $999+/month | Multi-seat controls, API, scheduled delivery, governed bulk workflows |

Validate Agent at $49 and $99 with 10 working agents before changing Paddle products. The buying threshold is not the number of markers; it is whether the weekly queue reliably creates useful conversations.

## MVP acceptance criteria

- Agent can import/select at least 250 property addresses.
- Queue is generated from at least five authoritative touch-reason types.
- Each opportunity displays score components, source, freshness, and limitations.
- Open, quick-watch, snooze, dismiss, and outcome actions work.
- No anonymous owner name/contact enrichment is required.
- Dashboard measures opportunities reviewed, touches recorded, replies, valuation requests, appointments, and listings.
- A weekly email contains the ten highest-value new or materially changed opportunities.
