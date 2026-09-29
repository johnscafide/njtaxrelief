# LinkedIn ads: Watchdog Agent plan, Q4 2026

Follows `00-brief/product-and-brand-brief.md` and `paid-media-strategy.md`. LinkedIn runs only in the Recommended ($1,060) and Aggressive ($2,540) tiers. At $8 to $14 per click it cannot sell a $59 self-serve trial on its own. It can do one thing well: put a lunch-and-learn offer in front of the people who decide what an office adopts, which are brokers of record, managing brokers, team leaders, and sales managers. One lunch-and-learn in front of 20 agents is worth more than 100 clicks to the landing page.

LinkedIn company page "Watchdog" [create if missing]. John's profile: linkedin.com/in/johnscafide. Insight Tag installed site-wide through the routing adapter (see `utm-and-tracking.md`).

## 1. Targeting

- Location: New Jersey. Also test "Greater New York City Area" and "Greater Philadelphia" narrowed by member profile location in a NJ county, because LinkedIn assigns many NJ members to a metro area. Check the audience count both ways and use whichever is between 5,000 and 25,000.
- Job titles (current): Real estate broker, Broker of record, Broker-owner, Managing broker, Team leader (real estate), Sales manager (real estate), Branch manager (real estate), Office manager (real estate), Director of agent development, Real estate team leader.
- Narrow by industry: Real estate. Exclude industries: Commercial real estate, Property management, Construction.
- Company size: 2 to 10, 11 to 50, 51 to 200, 201 to 500. Skip 1 (solo agents belong on Meta) and 1,000+ (franchisor HQs).
- Member skills (any of, as an OR layer, not a narrow): Real estate, Residential real estate, Listings, Buyer representation, Sellers, Real estate transactions, Brokerage, Real estate marketing, Agent recruiting.
- Exclusions: current customers (matched audience upload), employees, competitors' employees [PropStream, PropertyRadar, PropertyShark, ATTOM, Regrid company pages].
- Audience expansion: off. LinkedIn Audience Network: off.
- No age, gender, or other demographic targeting.

## 2. Formats

| Format | Use | Notes |
| --- | --- | --- |
| Single image | Lunch-and-learn offer, Founding Agent for teams, Triple Play, year-end | 1200x628 from the CR set |
| Document ad | Reuse the five-page carousel "What a NJ property looks like underneath the listing" from 03-social as a PDF | Awareness in Phase 0 and 1, retargeting seed |
| Thought leader ad | Sponsor John's own posts (Oct 1 assessment date, Dec 1 added assessment) | Needs John's authorization in Campaign Manager; no CTA button, comments on |

Objective: "Website conversions" for the trial ads, the platform's form-collection objective for the form ads (pick the objective that attaches a native form; in our files the asset is called the form), "Engagement" for thought leader ads.

## 3. Budgets by tier

From `budget-and-pacing.csv`.

| Phase | Recommended | Aggressive |
| --- | --- | --- |
| 0 | $0 | $60 (week of Oct 5, document ad only, to seed the Insight Tag audience) |
| 1 | $120 a week | $280 a week |
| 2 | $120 a week, $60 Thanksgiving week | $280 a week, $140 Thanksgiving week |
| 3 | $100 week of Dec 7, $60 week of Dec 14, off Dec 21 onward | $240, $140, off |

Split in Phase 1 and 2: 60 percent form campaign (AD-L-001, AD-L-002), 25 percent thought leader ads, 15 percent trial or invite ads. Phase 3: 50 percent Triple Play, 50 percent year-end.

## 4. Expected cost per lunch-and-learn booking

Assumptions (ranges, from `paid-media-strategy.md`): CPC $8 to $14, click to form completion 6 to 12 percent, form to booked session 35 to 50 percent (John calls within one business day).

| Tier | Form-campaign spend | Clicks | Forms | Bookings | Cost per booking |
| --- | --- | --- | --- | --- | --- |
| Recommended | about $640 | 46 to 80 | 3 to 10 | 1 to 5 | about $130 to $640 |
| Aggressive | about $1,520 | 109 to 190 | 7 to 23 | 2 to 11 | about $140 to $760 |

The wide range is honest. The mid case is 3 bookings on Recommended and 8 on Aggressive. Each booking should put Watchdog in front of 10 to 30 agents. If the first $400 produces zero forms, switch the form campaign to the document ad with the form attached and review the offer wording before spending more.

## 5. Ad variants

Intro text: one version under 150 characters, one version at 300 characters or fewer. Headline under 70 characters. UTM medium is `paid-social`, source `linkedin`.

### AD-L-001
- Format: Single image, form
- Phase: 1 and 2
- Intro (short): A 30-minute lunch-and-learn for your office: one NJ property, start to finish, source on every number. Agents leave with a free account.
- Intro (300): John Scafide, founder of Watchdog, comes to your office for 30 minutes. He walks your agents through one property from your market: assessment history, the town's Chapter 123 ratio, revaluation status, verified sales, permits. Every agent leaves with a free account. No pitch to the room.
- Headline: Book a Watchdog lunch-and-learn for your NJ office
- CTA: Sign up
- Creative: CR-03 (1200x628)
- Destination: LinkedIn native form (spec in section 6)
- Compliance note: No results promised. Lunch provided [confirm budget per office].

### AD-L-002
- Format: Single image, form
- Phase: 1 and 2
- Intro (short): Your agents have the MLS. Watchdog is the other half: what the property and the town look like underneath the listing. Book 30 minutes.
- Intro (300): Every agent in your office has the MLS. Few have the other half: the assessment and tax history, the town's Chapter 123 ratio, whether a revaluation is underway, verified sales, permits, with the source on every number. Book a 30-minute lunch-and-learn and see it on a property from your market.
- Headline: The evidence beside your MLS, shown on one of your listings
- CTA: Sign up
- Creative: CR-05 (1200x628)
- Destination: LinkedIn native form
- Compliance note: Says not an MLS by implication; the form thank-you text says it plainly.

### AD-L-003
- Format: Document ad (five-page PDF from the 03-social carousel)
- Phase: 0 and 1
- Intro (short): What a New Jersey property looks like underneath the listing. Five pages, one sample property, source and date on every number.
- Intro (300): One sample New Jersey property, five pages: the assessment history, the tax bill and what moved it, the town's Chapter 123 ratio and revaluation status, verified sales, and the permits on file. Every number carries its source and date. This is what Watchdog shows an agent before the appointment.
- Headline: Underneath the listing: a five-page sample property story
- CTA: Learn more (opens the document; no form)
- Creative: Carousel PDF [confirm asset ID in 03-social], fallback CR-01 pages
- Destination: Document viewed in feed; last page links to `https://www.watchdogindex.com/real-estate-agents?utm_source=linkedin&utm_medium=paid-social&utm_campaign=q4-agents-0&utm_content=ad-l-003`
- Compliance note: Sample address, labeled sample.

### AD-L-004
- Format: Thought leader ad (John's post)
- Phase: 0 and 1 (post goes up Oct 1)
- Intro (short): [Sponsor John's Oct 1 post on the assessment valuation date and what it means for 2027 listings. Text lives in 03-social.]
- Intro (300): [The post itself is the ad. Sponsor the published post; no edits. Confirm the post ID in 03-social. Post must include the county-board caveat on appeal deadlines.]
- Headline: Not applicable (thought leader ads use the post as-is)
- CTA: None
- Creative: John's post with CR-10 image
- Destination: Post; comments on. John replies to every comment within one business day.
- Compliance note: Requires John's authorization in Campaign Manager. No edits after sponsoring.

### AD-L-005
- Format: Thought leader ad (John's post)
- Phase: 2 (post goes up Nov 17)
- Intro (short): [Sponsor John's Dec 1 added-assessment deadline post. Text lives in 03-social.]
- Intro (300): [Sponsor the published post. Must state: added or omitted assessment appeals are due Dec 1 at the County Board of Taxation, or 30 days from the bulk mailing of added-assessment bills, whichever is later, and that Watchdog does not advise whether to appeal.]
- Headline: Not applicable
- CTA: None
- Creative: John's post with CR-02 image, Dec 1 overlay
- Destination: Post; comments on.
- Compliance note: Not a tax-appeal conclusion, stated in the post.

### AD-L-006
- Format: Single image
- Phase: 3 (Dec 1 to 10)
- Intro (short): Triple Play, Dec 7 to 10, Atlantic City. Bring one listing address to [booth or spot] and see the property story in five minutes.
- Intro (300): Triple Play, Dec 7 to 10, Atlantic City. Bring one address to [booth or meeting spot] and John pulls it up in Watchdog while you watch: assessment history, town ratio, revaluation status, verified sales, permits, the Watchdog Score. Five minutes, no pitch. Brokers: ask about an office session.
- Headline: Meet Watchdog at Triple Play, Dec 7 to 10
- CTA: Learn more
- Creative: CR-09 (1200x628)
- Destination: `https://www.watchdogindex.com/agents/trial?utm_source=linkedin&utm_medium=paid-social&utm_campaign=q4-agents-3&utm_content=ad-l-006`
- Compliance note: Booth placeholder filled before launch.

### AD-L-007
- Format: Single image
- Phase: 1 and 2
- Intro (short): Bring your team in as Founding Agents. 100 seats for New Jersey, invite code, direct line to the founder. Request invites for your office.
- Intro (300): The Founding Agent cohort is the first 100 paying NJ agents. Team leaders can request invites for the team. Same Agent plan, $59 per month or $590 per year: Agent Desk, Opportunity Desk, the Watchdog Score, 25 monitored properties each, Postcard Studio at $1.79 per card. Direct line to John.
- Headline: Request Founding Agent invites for your team
- CTA: Learn more
- Creative: CR-06 (1200x628)
- Destination: `https://www.watchdogindex.com/agents/trial?utm_source=linkedin&utm_medium=paid-social&utm_campaign=q4-agents-1&utm_content=ad-l-007`
- Compliance note: Prices from the brief only. Capacity stated per agent.

### AD-L-008
- Format: Single image
- Phase: 3 (Dec 14 to 31)
- Intro (short): $590 a year per agent, ten monthly payments for twelve months. Pay before Dec 31 and it is a 2026 expense. Ask your accountant.
- Intro (300): The Agent annual plan is $590 a year, ten monthly payments for twelve months. Paid before Dec 31 it sits in 2026; how you treat it is a question for your accountant. Each agent gets Agent Desk, Opportunity Desk, the Watchdog Score, 25 monitored properties, and Postcard Studio at $1.79 per card.
- Headline: Annual Agent plan, $590, before the 2027 notices land
- CTA: Learn more
- Creative: CR-08 (1200x628)
- Destination: `https://www.watchdogindex.com/pro?utm_source=linkedin&utm_medium=paid-social&utm_campaign=q4-agents-3&utm_content=ad-l-008`
- Compliance note: No tax advice. Teams plan is controlled enrollment; do not promise office-wide pricing.

## 6. Form spec (LinkedIn native form for the lunch-and-learn offer)

Form name: `Q4-LNL-FORM`. Attached to AD-L-001 and AD-L-002, and to AD-L-003 if the document ad is switched to a form.

Headline (60 characters max): Book a Watchdog lunch-and-learn for your office
Offer detail (160 characters max): 30 minutes, one property from your market, source on every number. Agents leave with a free account. John follows up within one business day.

Fields:
1. First name (LinkedIn autofill)
2. Last name (LinkedIn autofill)
3. Work email (LinkedIn autofill)
4. Brokerage (maps to Company, autofill)
5. Office town (custom question, free text, required)
6. Role (custom question, single select: Broker of record, Managing broker, Team leader, Sales manager, Agent, Other)
7. Number of agents in the office (custom question, single select: 1 to 10, 11 to 25, 26 to 50, 51 to 100, more than 100)

Consent checkbox (required): "Watchdog may contact me by email or phone about scheduling a lunch-and-learn." (This is the consent record for any follow-up call or text; without it, follow up by email only.)

Privacy policy URL: `https://www.watchdogindex.com/privacy` [confirm the clean route resolves].

Thank-you message: "Thanks. John will email you within one business day to pick a date. Watchdog is New Jersey property intelligence for agents; it is not an MLS, appraisal, or legal opinion."
Thank-you CTA: "Read the agent field guide" to `https://www.watchdogindex.com/real-estate-agents?utm_source=linkedin&utm_medium=paid-social&utm_campaign=q4-agents-1&utm_content=q4-lnl-form`

Handling: export form responses daily (LinkedIn keeps them 90 days), log each in the lunch-and-learn tracker in 06-recruitment-referral-partners, and fire `founding_invite_requested` equivalent tracking manually as `lnl_form_submitted` in the weekly report. John calls or emails within one business day; honor any do-not-contact request immediately.

## 7. Measurement

- Insight Tag conversions: `/agents/trial/thanks` page load (trial started), `/free` completion URL, and the native form submission.
- Report weekly: spend, impressions, clicks, CPC, form opens, form completions, cost per completion, bookings, cost per booking, plus `trial_started` attributed by UTM.
- Kill rule: zero form completions after $400; switch format before spending more.
