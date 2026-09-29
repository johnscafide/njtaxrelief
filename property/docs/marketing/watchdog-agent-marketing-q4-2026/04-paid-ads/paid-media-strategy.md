# Paid media strategy: Watchdog Agent plan, Q4 2026

Window: Monday September 28 to Thursday December 31, 2026 (95 days). Audience: New Jersey real estate agents, brokers, broker-owners, and team leaders. Nobody else.

Read `00-brief/product-and-brand-brief.md` first. Every number, phrase, and URL here follows it. The product costs $59 per month or $590 per year. Paid media for a $59 product only works with three things in place: tight geography, creative that shows a real property fact before the pitch, and a landing page built for one action. This plan is built around those three constraints.

## 1. What paid media has to do

Paid media is not the whole plan. Its job in Q4 is narrow:

1. Put the Watchdog agent story in front of New Jersey agents who have never heard of it, at a cost we can measure.
2. Fill the Founding Agent cohort (100 New Jersey agents) alongside the organic and outreach work.
3. Start enough 14-day Agent trials to learn the true trial-to-paid rate before 2027 appeal season.
4. Book brokerage lunch-and-learns (LinkedIn only, Recommended and Aggressive tiers).
5. Put a small, cheap presence around Triple Play (Dec 7 to 10, Atlantic City).

Paid media does not: sell owner contact data, promise outcomes, or describe property owners as prospects. Property data is not seller intent. Every ad in this folder is about the agent's work and the product.

## 2. Objectives by phase

| Phase | Dates | Paid media job | Primary conversion | Win looks like |
| --- | --- | --- | --- | --- |
| 0 Groundwork | Mon Sep 28 to Sun Oct 11 | Warm the ad accounts with content and free lookup ads, not trial ads. Install pixels and events. Build retargeting pools and the launch list. Get creative approved. | `free_account_created`, landing page views, video views | Pixels verified, 500 or more site visitors in the pool, 3 percent or better link CTR on content ads, first Founding invite requests |
| 1 Founding Agents open | Mon Oct 12 to Sun Nov 1 | Open the trial or invite door. Drive to `/agents/trial`. Learn cost per trial start. Start LinkedIn lunch-and-learn form. | `trial_started` (Variant A) or `founding_invite_requested` (Variant B) | Cost per trial start at or under target by end of week 2 (see section 7) |
| 2 Proof and scale | Mon Nov 2 to Sun Dec 6 | Scale the ad sets that hit target. Add proof creative (only real quotes, placeholders until then). Dec 1 added-assessment deadline hook. Lighter Thanksgiving week. | `trial_started`, `subscription_confirmed` | Trial-to-paid rate measured on the October cohort; CAC under 4 months of revenue |
| 3 Triple Play and year end | Mon Dec 7 to Thu Dec 31 | Triple Play geo campaign Dec 5 to 11. Year-end annual plan push from Dec 14 ("expense it in 2026"). Quiet week Dec 24 to 27. | `trial_started`, annual `subscription_confirmed` | Annual share of new paid accounts rises; Triple Play conversations tracked |

Hooks by date, for copy rotation: Oct 1 assessment valuation date; Nov 1 (Sunday) fourth-quarter tax payment, practically Mon Nov 2; Nov 2 PAS-1 and ANCHOR filing deadline; Dec 1 added or omitted assessment appeal deadline; Dec 7 to 10 Triple Play; 2027 appeal season (notices by about Feb 1, regular deadline April 1, May 1 in revalued towns, Jan 15 in Monmouth, Gloucester, and Burlington; always confirm with the county board).

## 3. Planning assumptions (labeled as assumptions, all ranges)

These are planning ranges, not observed Watchdog data. Replace them with observed numbers after week 2 of Phase 1.

| Input | Assumed range | Note |
| --- | --- | --- |
| Meta CPM, NJ agent interest audiences | $18 to $35 | Small audience, Q4 retail competition pushes CPM up in late November |
| Meta CPC | $1.50 to $3.50 | Link clicks, feed and Reels |
| Google Search CPC, competitor and "NJ property tax" terms | $3 to $9 | Competitor terms sit at the top of the range |
| LinkedIn CPC | $8 to $14 | Sponsored content, NJ, title targeted |
| YouTube CPV | $0.04 to $0.10 | Skippable in-stream and bumpers; click-through from views assumed 0.8 percent |
| Landing page view rate from click | 80 to 90 percent | Accidental taps and slow loads |
| Landing page to trial start, card required | 3 to 6 percent | Variant A |
| Landing page to invite request, no card | 8 to 14 percent | Variant B |
| Trial to paid, card required | 35 to 50 percent | Reminder 3 days before the first charge |
| Invite trial to paid, no card | 10 to 20 percent | 30-day beta trial |
| LinkedIn click to form completion | 6 to 12 percent | Native form, five fields |
| Form to booked lunch-and-learn | 35 to 50 percent | John follows up by phone within one business day |

## 4. Budget tiers for the full 95 days

Three tiers. Pick one before Oct 5 and set it in `budget-and-pacing.csv`. Weekly amounts by channel are in that file; the CSV is the source of truth and its totals are verified.

### Allocation by channel

| Channel | Lean $4,500 | Recommended $9,000 | Aggressive $18,000 | Reasoning |
| --- | --- | --- | --- | --- |
| Meta (Facebook and Instagram) | $2,500 | $3,700 | $7,040 | Cheapest reach into NJ agents, best creative canvas for the sample card. Carries the founder video. |
| Google Search | $1,300 | $2,360 | $4,680 | Captures agents already searching for competitor names and NJ tax terms. Small volume, high intent. |
| LinkedIn | $0 | $1,060 | $2,540 | Only for brokers, team leaders, and managing brokers, and only for the lunch-and-learn offer. Too expensive per click for a $59 self-serve trial. |
| YouTube | $0 | $740 | $1,720 | Cheap views into custom intent segments; feeds the video-viewer retargeting pool. Not a direct trial driver. |
| Retargeting (Meta and Google) | $700 | $1,140 | $2,020 | Where the $59 math actually closes. Sequenced by days since visit. |
| Total | $4,500 | $9,000 | $18,000 | |

### Allocation by phase

| Phase | Lean | Recommended | Aggressive | Reasoning |
| --- | --- | --- | --- | --- |
| 0 (2 weeks) | $300 | $500 | $1,040 | Content and free lookup only. Build pools, verify pixels. Do not spend on trial ads before the page exists. |
| 1 (3 weeks) | $1,280 | $2,620 | $5,330 | The door opens. Spend enough to reach a decision by week 2. |
| 2 (5 weeks) | $1,840 | $3,800 | $7,600 | Heaviest phase. Scale winners. Thanksgiving week runs at about 60 percent. |
| 3 (4 weeks) | $1,080 | $2,080 | $4,030 | Triple Play geo, year-end annual push, quiet Dec 24 to 27, short final week. |

### Which tier to pick

- Lean if checkout is not open on Oct 12 (Variant B, invite path). The invite path converts more visitors but fewer of them pay, so heavy spend would buy trials that do not turn into revenue. Lean also fits if John is running the ads himself with no coordinator.
- Recommended if checkout opens by Oct 12 and someone can do the Tuesday reviews every week. This is the tier the rest of this folder is written for.
- Aggressive only if the Recommended tier hits the week-2 win criteria in section 7 and Meta frequency stays under 4 per week on prospecting. New Jersey has roughly 53,000 REALTOR members; the reachable Meta audience is smaller. Above roughly $120 a day on Meta prospecting, frequency climbs and CPM rises, so the Aggressive tier buys diminishing returns. It is listed because it is the honest ceiling, not because it is recommended.

## 5. Funnel math by tier

Trial-driving spend excludes Phase 0 (content and pools) and LinkedIn (lunch-and-learn forms). Cases use the low, mid, and high ends of the assumption ranges in section 3, with the Variant A (card required) path. Paid accounts are rounded. MRR is paid accounts times $59.

### Lean, $4,500 total, $4,200 trial-driving

| Case | Clicks | Landing views | Trial starts | Paid accounts | MRR | CAC (full budget) |
| --- | --- | --- | --- | --- | --- | --- |
| Low | 1,020 | 820 | 25 | 9 | $531 | $500 |
| Mid | 1,490 | 1,265 | 57 | 24 | $1,416 | $188 |
| High | 2,400 | 2,160 | 130 | 65 | $3,835 | $69 |

### Recommended, $9,000 total, $7,440 trial-driving, $1,060 LinkedIn

| Case | Clicks | Landing views | Trial starts | Paid accounts | MRR | CAC (full budget) |
| --- | --- | --- | --- | --- | --- | --- |
| Low | 1,650 | 1,320 | 40 | 14 | $826 | $643 |
| Mid | 2,400 | 2,040 | 92 | 39 | $2,301 | $231 |
| High | 3,890 | 3,500 | 210 | 105 | $6,195 | $86 |

LinkedIn in this tier: 76 to 132 clicks, 5 to 16 form completions, 2 to 8 lunch-and-learns booked, $133 to $667 per booking. A lunch-and-learn in front of 20 agents is the cheapest way in this plan to get a room to try the product, so the cost per booking is acceptable even at the low end.

### Aggressive, $18,000 total, $14,480 trial-driving, $2,480 LinkedIn

| Case | Clicks | Landing views | Trial starts | Paid accounts | MRR | CAC (full budget) |
| --- | --- | --- | --- | --- | --- | --- |
| Low | 3,130 | 2,500 | 75 | 26 | $1,534 | $692 |
| Mid | 4,570 | 3,880 | 175 | 73 | $4,307 | $247 |
| High | 7,430 | 6,680 | 400 | 200 | $11,800 | $90 |

LinkedIn in this tier: 177 to 310 clicks, 11 to 37 forms, 4 to 19 bookings.

### What the math says

- In the mid case, CAC is $188 to $247 against $59 a month. Payback is 3 to 4 months on monthly billing and immediate on annual ($590). The year-end annual push in Phase 3 exists for this reason.
- The low case does not pay back on monthly billing inside six months. If week 2 of Phase 1 looks like the low case, cut prospecting to the two best ad sets, keep retargeting, and put the rest into the lunch-and-learn and referral work in folders 05 and 06.
- The high case is possible only if the landing page converts at 6 percent and Meta CPCs stay near $1.50. Do not plan on it.
- Variant B (invite path) produces more starts and fewer paid accounts. Model it as 8 to 14 percent of landing views requesting an invite, 10 to 20 percent of those paying at day 30. Founding invite requests are capped by the 100-seat cohort anyway, so the invite ads should pause once requests pass about 150 (allow for no-shows) and the remaining spend moves to trial ads or content.

## 6. Geography, exclusions, and audience limits

- Location: New Jersey only, by people located in New Jersey (not "interested in"). Meta: state targeting. Google: New Jersey with "Presence" setting, not "Presence or interest." LinkedIn: New Jersey geo plus Greater New York City Area and Greater Philadelphia members whose profile location resolves to a NJ county (LinkedIn's NJ coverage is split across metro areas; check the audience count both ways).
- Retargeting only: add a 10-mile buffer into the Philadelphia and NYC suburbs so agents who commute or whose device location drifts still see the sequence. Never use the buffer for prospecting.
- Exclusions everywhere: current paying customers (hashed email list exported from Supabase weekly), employees and contractors, anyone who already fired `subscription_confirmed`. Trial ads also exclude `trial_started` in the last 180 days. Invite ads exclude `founding_invite_requested`.
- Audience size reality: NJ has about 53,000 REALTOR members. Interest audiences on Meta will show larger numbers because they include people interested in real estate, not only licensees. Watch frequency, not reach.
- No demographic, protected-class, credit, health, or family attributes in targeting. Age targeting stays at 18 to 65+. No ZIP-level exclusions.

## 7. Measurement plan

### Events to fire (names are the site-side event names; see `utm-and-tracking.md` for the platform mapping)

| Event | Fires when | Where |
| --- | --- | --- |
| `view_landing` | `/agents/trial` renders (also fires GA4 `page_view`) | Landing page |
| `start_checkout` (existing `checkout_started`) | Visitor clicks "Start your 14-day Agent trial" and checkout opens | Landing page and `/pro` |
| `trial_started` | Trial subscription created with card on file | Stripe webhook (server) plus thank-you page (client, deduplicated) |
| `founding_invite_requested` | Invite form submitted | Landing page Variant B and `/beta` |
| `free_account_created` | Free account sign-up completes | `/free` flow |
| `academy_lesson_1_done` | Lesson 1 of Agent Academy marked complete | `/agent/training` |
| `subscription_confirmed` (existing) | First successful charge | Stripe webhook |

Primary optimization event: Phase 0 `free_account_created` and landing views; Phase 1 onward `trial_started` (Variant A) or `founding_invite_requested` (Variant B). `subscription_confirmed` is the truth metric and is reported weekly but not optimized on until there are 30 in 30 days.

### What counts as a win by end of week 2 of Phase 1 (Sunday Oct 25)

| Metric | Lean | Recommended | Aggressive |
| --- | --- | --- | --- |
| Trial starts (or invite requests on Variant B) | 12 or more | 25 or more | 50 or more |
| Blended cost per trial start | $90 or less | $85 or less | $85 or less |
| Landing page to trial start | 3 percent or more | 3 percent or more | 3 percent or more |
| At least one ad set at | $60 per trial or less | $60 per trial or less | $60 per trial or less |
| Founding invite requests, all sources | 30 or more | 40 or more | 50 or more |
| Academy lesson 1 completion among trials | 50 percent or more | 50 percent or more | 50 percent or more |

If the win criteria are met, hold budget and move to Phase 2 as planned. If two or more are missed, cut prospecting to the two best ad sets, keep retargeting and brand search, and rework the landing page before adding spend back.

### Kill rules (apply at every Tuesday review)

| Unit | Rule |
| --- | --- |
| Meta prospecting ad set | Pause if zero trial starts after $250 spend. Pause and replace creative if cost per trial start is above $120 after $360 spend. Pause if landing page view rate from clicks is under 70 percent after 200 clicks (page or placement problem). |
| Meta ad (creative) | Pause if link CTR is under 0.6 percent after 4,000 impressions, or if frequency passes 5 in 7 days on prospecting. |
| Google Search ad group | Pause non-brand keywords with CPC above $9 and zero trial starts after $300 spend. Pause the ad group if cost per trial start is above $150 after $450 spend. Add negatives every week regardless. |
| LinkedIn campaign | Pause if zero form completions after $400 spend; switch to the document ad format before spending more. |
| YouTube | Swap the first 5 seconds if view rate is under 15 percent on skippable after 3,000 impressions. Pause a placement with CPV above $0.12. |
| Retargeting | Refresh creative when frequency passes 6 in 7 days. Pause if cost per trial start is above 1.5 times the prospecting cost per trial (it should be well under). |

Scale rule: raise an ad set budget by no more than 20 percent per day, and only when it has 5 or more trial starts at or under $60 each in the prior 7 days.

## 8. Meta housing special ad category

Our ads promote software to real estate professionals. They are not housing ads. They do not offer, advertise, or discuss housing availability, rentals, sales of specific homes, mortgages, or neighborhoods for people to live in. So they do not belong in Meta's Housing special ad category, and we do not select it.

To keep it that way:

- Write copy about the agent's work and the product: research, past clients, farm mailers, tax history, assessment context, the Watchdog Score. Never about where someone should live, what a neighborhood is like for residents, or who a home is right for.
- Use sample addresses only (123 Example Street) and label sample data as sample.
- Do not use imagery of families, homes with people in them, or neighborhood lifestyle shots. Use the product card, the map view with no identifying labels, or John on camera.
- If Meta flags an ad anyway, appeal with the landing page (`/agents/trial`) and a one-line explanation: "Software subscription for licensed real estate agents in New Jersey; no housing offer." Do not add housing-opportunity language, and do not switch the campaign into the special category to get it approved, because that removes targeting we rely on and misdescribes the product.
- Keep a log of any flag and the appeal outcome in the weekly report.

## 9. Compliance reminders for every ad in this folder

- Never write anything that treats an owner as a prospect because of a public record. The banned phrases are listed in the brief, section 6; none of them appears in this folder, and none may be added. Approved: "a real reason to reach out," "property-triggered conversations," "know which past clients have a property reason to hear from you this week."
- No guaranteed outcomes. No "win your appeal," "cut taxes," "double your listings."
- Prices that may appear: $59 per month, $590 per year, $1,499 lifetime, $1.79 per card, $29 Move. Nothing else, including competitor prices, in ad copy.
- Offer phrases, exactly: "Start your 14-day Agent trial" and "Request a Founding Agent invite." Never use either of the two banned trial phrases from the brief (section 3), and never state a shorter trial length.
- Watchdog is not an MLS, appraisal, title search, inspection, legal opinion, or tax-appeal conclusion.
- No testimonials that do not exist. The one approved quote: "The property story is already there when I need it." attributed to "NJ real estate agent." Everything else stays a bracketed placeholder until a real one is signed off.
- No town called "worst" or "unfair." Use measurement language.
- Postcards go to "Current Resident." Agents include their name, brokerage, and any broker-required disclosure on anything they mail.

## 10. Who does what

- John: approves every ad before it goes live, records the founder videos, runs the lunch-and-learn follow-up, owns the Tuesday review decision.
- Coordinator: builds campaigns, uploads audiences, applies kill and scale rules, files the weekly report, keeps `budget-and-pacing.csv` current.
- Designer: produces CR-01 to CR-12 in three sizes each, plus video cuts, on the dates in `calendar-feed-paid.csv`.
- Engineering: pixel and Conversions API install, the seven events above, `/agents/trial` and its thank-you page, GA4 key events and the Google Ads import.

## 11. Files in this folder

- `meta-ads.md`: structure, audiences, 36 ad variants AD-M-001 to AD-M-036, testing plan.
- `google-search-ads.md`: six ad groups, keywords, negatives, responsive search ads, extensions, bidding.
- `linkedin-ads.md`: broker targeting, 8 variants AD-L-001 to AD-L-008, lunch-and-learn form spec.
- `youtube-ads.md`: 6 scripts AD-Y-001 to AD-Y-006, targeting, placements.
- `retargeting.md`: pools, sequence, caps, 12 variants AD-R-001 to AD-R-012.
- `landing-page-specs.md`: `/agents/trial`, improvements to `/for/real-estate-agents`, thank-you page.
- `utm-and-tracking.md`: UTM dictionary, events, platform mapping, weekly report template.
- `creative-briefs.md`: 12 static briefs CR-01 to CR-12.
- `budget-and-pacing.csv`: weekly spend by channel and tier, totals verified.
- `calendar-feed-paid.csv`: every dated paid-media action, Sep 28 to Dec 31.
