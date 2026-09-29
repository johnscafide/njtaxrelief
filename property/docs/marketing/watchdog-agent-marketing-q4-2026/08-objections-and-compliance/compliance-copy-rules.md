# Compliance and copy rules (checked against every file in this plan)

Use this page as the final review before anything ships. It repeats the binding rules from the brief in checklist form and adds the review process.

## Banned and approved language

| Never write | Write instead |
| --- | --- |
| leads, seller leads, lead list, lead gen | reasons to reach out, property-triggered conversations, opportunities to be useful, the Monday desk |
| likely to sell, going to sell, motivated seller, distressed, pre-foreclosure list, predict who will list | a property reason to check in, a change worth a conversation |
| ROBUST Score | the Watchdog Score, powered by the ROBUST Framework |
| Watchdog Intel, Intel, AI badge language | Watchdog Intelligence (exact words) |
| worst town, most unfair town, rip-off town | Uniformity: 62; assessment pressure above the peer band; measurement language |
| win your appeal, cut taxes 20 percent, double your listings, guaranteed | no outcome promises; describe what the evidence shows |
| real-time data, live data | source and date shown on every number; refreshed from state sources |
| free forever, no card ever, 7-day trial | 14-day Agent trial (card required, $59 per month after), Founding Agent invite (30 days by code) |
| any price other than $59/month, $590/year, $1,499 lifetime, $1.79 per card, $29 Move | those prices only |
| an MLS replacement, appraisal, title search, legal advice | the evidence companion beside the MLS; not an appraisal, title search, inspection, or legal opinion |
| owner phone numbers, skip tracing, contact lists | your own sphere and CRM, matched to parcels; postcards to Current Resident |
| emojis, em dashes, exclamation stacks, buzzwords (leverage, unlock, seamless, game-changer, supercharge, empower, next-level, revolutionize, cutting-edge) | plain words |

## Rules that are not about wording

1. Property data is not seller intent. Every reason to reach out is a property event with a source and a date, never a judgment about the owner.
2. No protected-class, demographic, credit, health, or family attributes anywhere in targeting, copy, or examples. No steering language about who should live where.
3. Meta ads: we sell software to agents. Keep copy about the agent's work and the product. If Meta applies the housing category, appeal with the landing page. Do not add housing-availability language to get approved.
4. Sample screens are labeled "sample" and use non-identifying addresses (123 Example Street). No real customer screenshots without written permission.
5. No fabricated testimonials, reviews, numbers, or results. Placeholders in square brackets until a real quote exists with the agent's written permission.
6. Every trial mention that references the charge states the amount ($59), the day (day 14), and how to cancel (one click from Account).
7. Founding Agents and ambassadors disclose the relationship when they post ("I am a Founding Agent on Watchdog and get [benefit]").
8. Our outreach: no cold texts to agents without prior consent; cold email only to business addresses with an unsubscribe link and a physical address; honor do-not-contact requests immediately and log them.
9. Agents' own postcards through Postcard Studio carry their name, brokerage, and any broker-required disclosure.
10. Never claim the Watchdog Score determines legal, lending, insurance, housing, or investment outcomes.

## Review process before anything ships

1. Read the piece out loud. If it sounds like a brochure, rewrite it.
2. Search for the em dash character (U+2014) and every banned phrase above. Fix all hits.
3. Check every number against the brief. Delete any number not in the brief unless it is a labeled sample.
4. Check every URL is a clean root-level www.watchdogindex.com route with the UTM pattern.
5. For anything mentioning the trial: amount, day, cancel method present.
6. For anything mentioning an owner or property: is it a property event with a source, or a claim about a person? Only the first is allowed.
7. For paid ads: character limits checked, no housing-availability language, geo set to New Jersey.
8. For emails: unsubscribe link, physical address, sender name is a person.
9. Log the check in the tracking sheet with the asset ID and date.

## Quick grep used in this plan

Run from the plan folder:

```
grep -rn -e "$(printf '\xe2\x80\x94')" -e "lead" -e "likely to sell" -e "motivated" -e "distressed" -e "ROBUST Score" -e "Intel " -e "7-day" -e "free forever" -e "unlock" -e "leverage" -e "seamless" -e "game-chang" --include=*.md --include=*.csv . | grep -v -e "leader" -e "leadership" -e "Intelligence"
```

Anything the grep finds gets fixed or gets an explicit exception written next to it.
