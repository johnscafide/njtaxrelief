# Meta ads (Facebook and Instagram): Watchdog Agent plan, Q4 2026

Follows `00-brief/product-and-brand-brief.md` and `paid-media-strategy.md`. Meta is the largest channel in every tier because it is the cheapest way to put a sample property card in front of New Jersey agents. It is not in the Housing special ad category (see the strategy file, section 8).

Pages and handles: Facebook page "Watchdog New Jersey Property Intelligence" [create], Instagram @watchdogindex [create]. Both must exist, with a profile image and three organic posts each, before the first ad runs on Oct 5.

## 1. Campaign structure

Manual campaigns, not Advantage+ Shopping, because the audience is small and we need to control frequency and exclusions. Advantage+ placements are on for prospecting, off for retargeting. Advantage+ audience expansion is off in Phase 0 and 1, tested in one ad set in Phase 2.

Naming convention: `Q4-<phase>-<audience>-<creative-id>` at the ad level. Campaign and ad set levels drop the trailing parts.

| Level | Name | Objective | Optimization event |
| --- | --- | --- | --- |
| Campaign | `Q4-P0-CONTENT` | Traffic and engagement | Landing page views; `free_account_created` once it has 50 in 7 days |
| Campaign | `Q4-P1-TRIAL` | Sales (conversions) | `trial_started` (Variant A) |
| Campaign | `Q4-P1-INVITE` | Sales (conversions) | `founding_invite_requested` (Variant B, or alongside A) |
| Campaign | `Q4-P2-TRIAL`, `Q4-P2-INVITE` | Same, renamed at the phase boundary so reporting splits cleanly | Same |
| Campaign | `Q4-P3-TRIAL`, `Q4-P3-ANNUAL`, `Q4-P3-TRIPLEPLAY` | Sales; Triple Play uses reach with a radius | `trial_started`; Triple Play optimizes landing page views |
| Campaign | `Q4-RT` (all phases) | Sales | `trial_started`; see `retargeting.md` |

Ad set names: `Q4-P1-INT`, `Q4-P1-EMP`, `Q4-P1-LAL`, `Q4-P1-LIST`, `Q4-P3-TP`. Ad names: `Q4-P1-INT-AD-M-007`.

Audience codes:

| Code | Audience |
| --- | --- |
| INT | Interest stack, NJ real estate professionals |
| EMP | Brokerage employer stack |
| LAL | Lookalike of launch list and free accounts |
| LIST | Launch list custom audience (hashed emails) |
| RT | Retargeting pools (see `retargeting.md`) |
| TP | Triple Play radius, Atlantic City Convention Center, Dec 5 to 11 |

## 2. Audiences

### INT: interest stack (prospecting, all phases)

Location: New Jersey, people living in this location. Age 18 to 65+. No gender, no other demographics.

Detailed targeting, narrowed (must match at least one from each group):

- Group A (interests): Real estate broker, Real estate agent, National Association of Realtors, Realtor.com, Zillow Premier Agent, Multiple listing service, Real estate license, Commercial real estate (excluded, see below), kvCORE, BoldTrail, Follow Up Boss, Dotloop, ShowingTime, Matterport
- Group B (narrow, job title or field of study or employer): Real estate agent, Realtor, Real estate broker, Real estate salesperson, Licensed real estate agent, Associate broker, Real estate team leader; field of study: Real estate

Exclude: Commercial real estate interest without residential overlap, property management, current customers, employees, `trial_started` 180 days, `subscription_confirmed` 365 days.

Expected size: [check in Ads Manager; note the number in the weekly report]. If under 40,000, drop Group B and rely on Group A plus the exclusions.

### EMP: brokerage employer stack (prospecting, Phase 1 onward)

Same location and exclusions. Employers: Weichert Realtors, Berkshire Hathaway HomeServices Fox and Roach, Keller Williams Realty, RE/MAX, Coldwell Banker Realty, Century 21, Compass, eXp Realty, Corcoran, Sotheby's International Realty, Howard Hanna, Redfin, Christie's International Real Estate, Better Homes and Gardens Real Estate, ERA Real Estate, plus [add the five largest NJ independents from the recruitment folder]. Narrowed by Group A interests above.

### LAL: lookalikes (Phase 1 onward, when the source is big enough)

- LAL-LIST: 1 percent NJ lookalike of the launch list. Needs 100 matched people minimum; do not build it under 300 matched.
- LAL-FREE: 1 percent NJ lookalike of `free_account_created` in the last 90 days, once it has 300 or more.
- LAL-TRIAL: 1 percent NJ lookalike of `trial_started`, once it has 100 or more (probably Phase 2 or later).

Always layer NJ location on a lookalike. Lookalikes are built nationally and then restricted.

### LIST: launch list custom audience

Hashed email upload of the launch list from the plans page and the Founding Agent form. Refresh every Monday. Used for the Founding invite ads and the year-end annual ads. Also used as the seed for LAL-LIST.

### RT: retargeting

Defined in `retargeting.md`. Pools: site visitors 30 days (agent pages only), landing page non-converters, checkout abandoners, video viewers 50 percent or more, IG and FB engagers 90 days, launch list.

### TP: Triple Play

Radius targeting, 2 miles around Atlantic City Convention Center, Dec 5 to 11, narrowed by Group A interests, "people recently in this location." Small audience, reach objective, capped at 3 impressions per day. After Dec 11, this audience becomes a 30-day retargeting pool for AD-M-036.

## 3. Placements

- Prospecting: Advantage+ placements on, with Audience Network and Messenger excluded. Provide 1080x1080 (feed), 1080x1920 (Stories and Reels), and 1200x628 (right column and Marketplace fallback) for every creative.
- Retargeting: manual placements, Facebook feed, Instagram feed, Stories, Reels. No Audience Network.
- Video ads (SV series and AD-M-003, 014, 024, 034): feed and Reels, captions burned in, sound-off first.

## 4. Budgets by tier (Meta prospecting only; retargeting is in `retargeting.md`)

From `budget-and-pacing.csv`.

| Phase | Lean | Recommended | Aggressive |
| --- | --- | --- | --- |
| 0 (Sep 28 to Oct 11) | $200 total, about $14 a day from Oct 5 | $320, about $23 a day | $600, about $43 a day |
| 1 (Oct 12 to Nov 1) | $250 a week | $380 a week | $750 a week |
| 2 (Nov 2 to Dec 6) | $220 a week, $150 Thanksgiving week | $320 a week, $200 Thanksgiving week | $600 a week, $380 Thanksgiving week |
| 3 (Dec 7 to Dec 31) | $200, $180, $60, $80 by week | $300, $260, $80, $120 | $560, $480, $150, $220 |

Ad set split in Phase 1, Recommended tier ($380 a week): INT $150, EMP $90, LAL or LIST $80, INVITE campaign $60. Lean tier runs INT and one INVITE ad set only. Aggressive adds a second INT ad set with Advantage+ audience expansion on, as a test.

## 5. Ad copy variants

Format for each: ID, phase, angle, audience, primary text short (under 125 characters), primary text long (150 to 250 words), headline (under 40 characters), description (under 30 characters), CTA button, destination URL with UTM, creative reference, compliance note.

UTM asset IDs are lowercase in URLs (`ad-m-001`) so GA4 does not split rows by case. UTM medium is `paid-social`.

Every sample number in this file is representative and must appear on the creative with the word "sample."

---

### Phase 0: content and free lookup (AD-M-001 to AD-M-006)

#### AD-M-001
- Phase: 0
- Angle: Walk in knowing
- Audience: INT
- Primary text (short): Assessment up 11.4% since 2024. Source and date attached. Look up any NJ property free before the next appointment.
- Primary text (long): Here is what a listing appointment looks like when you already know the property. The assessment went up 11.4 percent since 2024. The town finished a reassessment last year. A deck permit closed in May. The last verified sale on the block closed in June. Every one of those facts has a source and a date next to it. That is what Watchdog shows for a New Jersey property. It pulls the public record, assessment and tax history, Chapter 123 context, verified sales, permits, and town context into one view. The MLS tells you what is for sale. Watchdog tells you what is underneath the listing and what changed since you last looked. The lookup is free. Create a free account, type an address, and read the property story before the conversation starts. The figures above are sample figures. Watchdog is not an appraisal, and assessments are tax-administration values, not list prices.
- Headline: Know the property before you walk in
- Description: Free NJ property lookup
- CTA button: Learn more
- Destination: https://www.watchdogindex.com/free?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-0&utm_content=ad-m-001
- Creative: CR-01
- Compliance note: Sample address and figures labeled sample. No outcome claim. Not an appraisal.

#### AD-M-002
- Phase: 0
- Angle: Tax bill translator
- Audience: INT
- Primary text (short): A client asks why the tax bill went up. You have thirty seconds. Here is the plain answer, with the source, free.
- Primary text (long): A buyer asks why the tax bill on a house went up 7 percent when the assessment did not move. That question has three possible answers: the tax rate changed, the assessment changed, or the town's ratio changed. In New Jersey the third one confuses everyone, including a lot of agents. Watchdog puts the three pieces side by side for any property in the state: assessment history, the municipal tax rate by year, and the Chapter 123 ratio for that town, each with its source and date. You can read it in under a minute and explain it in plain words. The agent field guide walks through it with sample properties. It is free to read and there is nothing to sign up for. Watchdog is not a tax-appeal conclusion or a legal opinion. It shows the public record so you can have a straight conversation about it. Read it before the next showing.
- Headline: Explain a NJ tax bill in one minute
- Description: Agent field guide, free
- CTA button: Learn more
- Destination: https://www.watchdogindex.com/real-estate-agents?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-0&utm_content=ad-m-002
- Creative: CR-02
- Compliance note: Percentage is a sample. Says not a tax-appeal conclusion. No town named.

#### AD-M-003
- Phase: 0
- Angle: Founder story
- Audience: INT
- Primary text (short): I spent years explaining NJ property taxes to homeowners. Agents kept asking for the same tool. So I built it.
- Primary text (long): I am John Scafide. For a few years now I have been explaining New Jersey property taxes to homeowners, mostly on TikTok, one confused question at a time. Somewhere along the way agents started messaging me. Not about their own houses. About their clients' houses. They wanted to walk into a listing appointment already knowing the assessment history, whether the town was revaluing, what the last verified sale on the street was, and whether the Chapter 123 ratio made the tax bill testable. They wanted the source next to every number so they could say where it came from. That is what Watchdog is. New Jersey property intelligence, built for the way agents here actually work. This video is me explaining it in two minutes. If it sounds useful, the agent field guide is free to read and the property lookup is free to use. It is New Jersey only, on purpose.
- Headline: Why I built Watchdog for NJ agents
- Description: A note from John Scafide
- CTA button: Watch more
- Destination: https://www.watchdogindex.com/real-estate-agents?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-0&utm_content=ad-m-003
- Creative: SV founder story video [confirm SV ID in 03-social]; fallback CR-12
- Compliance note: First person, no claims. No numbers.

#### AD-M-004
- Phase: 0
- Angle: Walk in knowing (Oct 1 hook)
- Audience: INT
- Primary text (short): October 1 is New Jersey's assessment valuation date. Here is what it means for the properties you sell in 2027.
- Primary text (long): October 1, 2026 is the assessment valuation date in New Jersey. Assessments for tax year 2027 are supposed to reflect value as of that day. Notices go out around February 1. The regular appeal deadline is April 1, or May 1 in towns that completed a revaluation or reassessment, and January 15 in Monmouth, Gloucester, and Burlington under the alternate calendar. Always confirm with the county board. Why does an agent care? Because the buyer closing in March will get a 2027 bill built on a number set today, and the seller listing in January will be asked about it. Watchdog shows the assessment history, the town's revaluation status, and the Chapter 123 ratio for any New Jersey property, with the source and date attached. The lookup is free. Type an address and read it before the client asks. It takes about a minute. Watchdog is not an appraisal or a tax-appeal conclusion.
- Headline: Oct 1: the date behind 2027 taxes
- Description: Free lookup, source attached
- CTA button: Learn more
- Destination: https://www.watchdogindex.com/free?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-0&utm_content=ad-m-004
- Creative: CR-10
- Compliance note: Dates are confirmed in the brief. Says confirm with the county board. No outcome claim.

#### AD-M-005
- Phase: 0
- Angle: Walk in knowing (Town Compare)
- Audience: INT
- Primary text (short): Two towns, one buyer, one question about taxes. Compare municipal tax and assessment context side by side. Free.
- Primary text (long): A buyer is deciding between two towns and asks the question every agent gets: what is the tax situation really like? Not the sticker on one listing. The town. Town Compare puts two New Jersey municipalities side by side: effective tax rate, assessment ratio, revaluation status, and the assessment pressure measures behind the Watchdog Score, each with its source and year. It is measurement language, not opinion. No town is called good or bad. You get a page you can walk a client through in a minute and a link you can send afterward. There are 564 municipalities in New Jersey and every one of them is in there. Town Compare is free. Watchdog is the evidence companion beside the MLS: the MLS tells you what is for sale, Watchdog tells you what the property and the town look like underneath it. Assessments are tax-administration values, not list prices. Save the link for the next buyer.
- Headline: Compare two NJ towns in 30 seconds
- Description: Town Compare, free
- CTA button: Learn more
- Destination: https://www.watchdogindex.com/town-compare?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-0&utm_content=ad-m-005
- Creative: CR-11
- Compliance note: Measurement language only. No town ranked or named. No steering language.

#### AD-M-006
- Phase: 0
- Angle: Founding Agent scarcity (100 seats)
- Audience: INT and LIST
- Primary text (short): Watchdog is opening 100 Founding Agent seats for New Jersey. Request an invite before the door opens Oct 12.
- Primary text (long): On October 12 Watchdog opens the Agent plan to New Jersey agents, and the first 100 paying agents form the Founding Agent cohort. Founding Agents get the same plan as everyone else: Agent Desk, Opportunity Desk, Property Lookup with the Watchdog Score, monitoring for up to 25 properties, Postcard Studio at $1.79 per card, and Agent Academy. What they get that later agents do not is a direct line to me while the product is being shaped, and their name on the founding list if they want it there. It is limited to 100 New Jersey agents because that is the number I can actually talk to. Request a Founding Agent invite now and you will get the invite code the morning the door opens. No card is needed to request the invite. Watchdog is New Jersey property intelligence: assessment, tax history, Chapter 123 context, verified sales, permits, and town context, with the source on every number.
- Headline: 100 Founding Agent seats. NJ only.
- Description: Request an invite
- CTA button: Apply now
- Destination: https://www.watchdogindex.com/beta?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-0&utm_content=ad-m-006
- Creative: CR-06
- Compliance note: "100" is the real cohort cap. Founding benefits limited to what exists. No pricing beyond $1.79 per card.

---

### Phase 1: trial and Founding Agent invite (AD-M-007 to AD-M-018)

#### AD-M-007
- Phase: 1
- Angle: Walk in knowing
- Audience: INT
- Primary text (short): Assessment, tax history, permits, verified sales, town context. One view, source on every number. 14-day Agent trial.
- Primary text (long): 123 Example Street. Assessment up 11.4 percent since 2024, source MOD-IV, August 2026. Town reassessment completed 2025. Deck permit closed May 2026. Nearest verified sale June 2026. Those are sample figures, but that is the card an agent sees in Watchdog before a listing appointment. One property view with the public record, assessment and tax history, Chapter 123 context, verified sales, permits, and municipal context, and the source and date attached to every number. The MLS tells you what is for sale. Watchdog tells you what is underneath the listing and what changed since you last looked. Start your 14-day Agent trial. A card is required, it is $59 per month after day 14 unless you cancel, we remind you three days before the first charge, and you can cancel in one click from Account. Cancel before day 14 and you pay nothing. Watchdog is not an appraisal or a tax-appeal conclusion.
- Headline: Start your 14-day Agent trial
- Description: $59 per month after day 14
- CTA button: Sign up
- Destination: https://www.watchdogindex.com/agents/trial?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-1&utm_content=ad-m-007
- Creative: CR-07 (feed), CR-01 (Stories)
- Compliance note: Full trial disclosure in the long text. Sample address. Not an appraisal.

#### AD-M-008
- Phase: 1
- Angle: Walk in knowing
- Audience: EMP
- Primary text (short): Your office has the MLS. Watchdog is the other half: what the property and the town look like underneath the listing.
- Primary text (long): Every agent in your office has the MLS. Almost nobody has the other half of the story. Watchdog is New Jersey property intelligence: the assessment and tax history, the Chapter 123 ratio for the town, whether a revaluation is underway, verified sales from SR1A, permits, and flood or environmental screening, in one property view with the source and date next to every number. It is built for New Jersey only. There are 564 municipalities and 131,244 verified sales on file. When a client asks why the taxes on a house are what they are, you answer with the record instead of a guess. When a past client's town starts a reassessment, you know before they do. Start your 14-day Agent trial. Card required, $59 per month after day 14 unless cancelled, reminder three days before the first charge, one-click cancel from Account. Watchdog is not an MLS, an appraisal, or a legal opinion.
- Headline: The evidence beside your MLS
- Description: 14-day Agent trial, $59/month
- CTA button: Sign up
- Destination: https://www.watchdogindex.com/agents/trial?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-1&utm_content=ad-m-008
- Creative: CR-05
- Compliance note: Real counts from the brief only. Says not an MLS.

#### AD-M-009
- Phase: 1
- Angle: Tax bill translator
- Audience: INT
- Primary text (short): Rate, assessment, ratio. The three reasons a NJ tax bill moves, side by side for any property, with the source.
- Primary text (long): A New Jersey tax bill moves for three reasons: the tax rate changed, the assessment changed, or the town's Chapter 123 ratio changed. Most conversations about a tax bill go badly because nobody in the room knows which one it was. Watchdog shows the three pieces side by side for any property in the state. Assessment by year. Municipal tax rate by year. The town's ratio and where the property sits against it. Every figure has a source and a date. You read it in a minute and explain it in plain words, and the client hears an agent who knows the property. That is what the Agent plan is for. It also includes Opportunity Desk, monitoring for up to 25 properties, and Postcard Studio. Start your 14-day Agent trial. Card required, $59 per month after day 14 unless cancelled, reminder three days before, one-click cancel. Watchdog is not a tax-appeal conclusion or a legal opinion.
- Headline: Read any NJ tax bill in a minute
- Description: Start your 14-day Agent trial
- CTA button: Sign up
- Destination: https://www.watchdogindex.com/agents/trial?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-1&utm_content=ad-m-009
- Creative: CR-02
- Compliance note: No town named. Not a tax-appeal conclusion.

#### AD-M-010
- Phase: 1
- Angle: The Monday desk reason to reach out
- Audience: INT
- Primary text (short): Monday: three past clients have a property reason to hear from you this week. Watchdog found them. Sample shown.
- Primary text (long): Monday morning. Opportunity Desk shows three past clients with a property reason to hear from you this week. One is in a town that just announced a reassessment. One has an assessment increase above the peer band, with the source date from August. One had a permit close last month. Each card gives the reason, the confidence, the source date, homeowner-safe wording, and the next action. None of it is a guess about what the owner wants to do. It is a real reason to reach out, about their property, from the public record. That is the difference between a check-in text and a useful one. Cards are ranked Now, This week, and Watch, and a weekly email brings the ten highest-value new items. Start your 14-day Agent trial. Card required, $59 per month after day 14 unless cancelled, reminder three days before the first charge, one-click cancel from Account. Sample data shown.
- Headline: A real reason to reach out. Weekly.
- Description: Opportunity Desk, weekly
- CTA button: Sign up
- Destination: https://www.watchdogindex.com/agents/trial?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-1&utm_content=ad-m-010
- Creative: CR-03
- Compliance note: Uses approved language only ("a real reason to reach out"). Says it is not a guess about owner intent. No owner contact data implied.

#### AD-M-011
- Phase: 1
- Angle: The Monday desk reason to reach out
- Audience: LAL
- Primary text (short): Your past clients own property. Property changes. Watchdog tells you which ones have a reason to hear from you.
- Primary text (long): You have a list of past clients. Every one of them owns a New Jersey property, and every one of those properties changes: assessments move, towns revalue, permits open and close, sales close nearby, appeal deadlines come around. Most of those changes are invisible to you unless the client calls. Watchdog watches the public record for the properties you add and turns changes into cards: the reason, the confidence, the source date, wording that is safe to say to a homeowner, and a next action. Ranked Now, This week, and Watch. It is not a prediction about what anyone will do. It is a property-triggered conversation with someone who already knows you. Upload your sphere or CRM references and Watchdog matches them to parcels. Start your 14-day Agent trial. Card required, $59 per month after day 14 unless cancelled, reminder three days before the first charge, cancel in one click.
- Headline: Know which past clients to call
- Description: Property-triggered reasons
- CTA button: Sign up
- Destination: https://www.watchdogindex.com/agents/trial?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-1&utm_content=ad-m-011
- Creative: CR-03
- Compliance note: "Not a prediction about what anyone will do." Uses "property-triggered conversation." Contacts are the agent's own.

#### AD-M-012
- Phase: 1
- Angle: Farm postcards at $1.79
- Audience: INT
- Primary text (short): Postcards to your farm for $1.79 per card, printing and postage included. Design, proof, and mail from the map.
- Primary text (long): Draw your farm on the map. Watchdog builds the mailing list from the parcels inside it, you design a 6 by 8.5 postcard in Postcard Studio, proof it, and it goes out First Class. $1.79 per card on the Agent plan, printing and postage included, minimum 50 mailable addresses. Owner names are not public in New Jersey, so cards go to Current Resident. Anything that cannot be mailed comes back as mail credit. The card can carry a real property fact for that street, like the town's revaluation status or the assessment ratio, which is a better opener than a market update nobody reads. Put your name, brokerage, and any disclosure your broker requires on the card; Postcard Studio has the space for it. Start your 14-day Agent trial and send your first mailer inside the trial. Card required, $59 per month after day 14 unless cancelled, reminder three days before the first charge, one-click cancel.
- Headline: Farm postcards, $1.79 per card
- Description: Printing and postage included
- CTA button: Sign up
- Destination: https://www.watchdogindex.com/agents/trial?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-1&utm_content=ad-m-012
- Creative: CR-04
- Compliance note: Current Resident stated. Broker disclosure stated. Minimum 50 stated. Postcard cost is separate from the plan.

#### AD-M-013
- Phase: 1
- Angle: PropStream alternative for NJ
- Audience: INT
- Primary text (short): National tools go wide. Watchdog goes New Jersey deep: assessment, Chapter 123, revaluations, added assessments.
- Primary text (long): If you only work New Jersey, a national prospecting platform gives you fifty states of data at one depth. Watchdog does one state at full depth. Assessment and tax history by year. The Chapter 123 ratio for every one of the 564 municipalities. Which towns are revaluing or reassessing. Added and omitted assessments and their December 1 appeal deadline. 131,244 verified SR1A sales. Permits. Municipal context. The source and date on every number, so you can say where it came from. It does not do what a national tool does: it does not sell owner phone numbers, skip tracing, or contact lists, and it is not built for prospecting across the country. Compare the job, not the bill. If the job is New Jersey, start your 14-day Agent trial. Card required, $59 per month after day 14 unless cancelled, reminder three days before the first charge, cancel in one click from Account.
- Headline: New Jersey deep, not national wide
- Description: Start your 14-day Agent trial
- CTA button: Sign up
- Destination: https://www.watchdogindex.com/agents/trial?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-1&utm_content=ad-m-013
- Creative: CR-05
- Compliance note: No competitor named in the ad, no competitor price. Does not trash competitors. States what Watchdog does not do.

#### AD-M-014
- Phase: 1
- Angle: Founder story
- Audience: LAL
- Primary text (short): Agents kept asking me for the property story before the appointment. So I built Watchdog. The two-minute version.
- Primary text (long): I am John Scafide. I have spent years explaining New Jersey property taxes to homeowners on TikTok. Agents started asking me for something different: the whole property story before they walked into an appointment, with the source next to every number so they could say where it came from. So I built Watchdog. It is New Jersey property intelligence for agents: assessment and tax history, Chapter 123 context, verified sales, permits, town context, an Opportunity Desk that gives you a real reason to reach out to past clients, and Postcard Studio for your farm at $1.79 per card. This video is the two-minute version. The Agent plan opened this month to New Jersey agents. Start your 14-day Agent trial. Card required, $59 per month after day 14 unless you cancel, reminder three days before the first charge, one-click cancel from Account. If it is not useful in 14 days, cancel and pay nothing.
- Headline: Two minutes on why I built this
- Description: Start your 14-day Agent trial
- CTA button: Sign up
- Destination: https://www.watchdogindex.com/agents/trial?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-1&utm_content=ad-m-014
- Creative: SV founder story video [confirm SV ID in 03-social]; fallback CR-12
- Compliance note: First person. Trial disclosure complete.

#### AD-M-015
- Phase: 1
- Angle: Founding Agent scarcity (100 seats)
- Audience: INT
- Primary text (short): 100 Founding Agent seats for New Jersey. Invite code, direct line to the founder, same $59 plan. Request an invite.
- Primary text (long): The Founding Agent cohort is the first 100 paying New Jersey agents on Watchdog. It is not a different plan. It is the same Agent plan at $59 per month or $590 per year: Agent Desk, Opportunity Desk, Property Lookup with the Watchdog Score, monitoring for up to 25 properties, Postcard Studio at $1.79 per card, Agent Academy. What Founding Agents get is an invite code, a direct line to me while the product is being shaped, and a say in what gets built next. The cap is 100 because that is the number of people I can actually talk to. Request a Founding Agent invite. You will get a code and an invite-only trial, and no card is needed to request it. When the 100 seats are gone the cohort closes and the regular 14-day trial is the only door. Watchdog is New Jersey property intelligence, not an MLS, appraisal, or legal opinion.
- Headline: Request a Founding Agent invite
- Description: 100 seats, New Jersey only
- CTA button: Apply now
- Destination: https://www.watchdogindex.com/agents/trial?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-1&utm_content=ad-m-015
- Creative: CR-06
- Compliance note: Scarcity is real (100-seat cap). No extra benefits invented. Prices from the brief only.

#### AD-M-016
- Phase: 1
- Angle: Founding Agent scarcity (100 seats)
- Audience: LIST
- Primary text (short): You joined the launch list. The Founding Agent door is open. Your invite code is waiting; request it here.
- Primary text (long): You put your name on the Watchdog launch list. The door is open now. The Founding Agent cohort is the first 100 paying New Jersey agents, and because you were early you are first in line for one of the seats. Request a Founding Agent invite and you get a code for an invite-only trial, no card needed to request it. The plan is the Agent plan: Agent Desk, Opportunity Desk with a real reason to reach out to past clients each week, Property Lookup with the Watchdog Score, monitoring for up to 25 properties, Postcard Studio at $1.79 per card, and Agent Academy, which every trial account works through. $59 per month or $590 per year once you decide to stay. As a Founding Agent you also get a direct line to me while the product is being shaped. Seats go in the order requests come in. Watchdog is not an MLS, an appraisal, or a legal opinion.
- Headline: Your Founding Agent invite is ready
- Description: Launch list members first
- CTA button: Apply now
- Destination: https://www.watchdogindex.com/agents/trial?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-1&utm_content=ad-m-016
- Creative: CR-06
- Compliance note: Only serve to the LIST audience so "you joined the launch list" is true.

#### AD-M-017
- Phase: 1
- Angle: Tax bill translator (Nov 1 tax quarter)
- Audience: INT
- Primary text (short): Fourth-quarter taxes are due Nov 1. Clients will ask what changed. Have the assessment, rate, and ratio ready.
- Primary text (long): The fourth-quarter property tax payment is due November 1, and this year that is a Sunday, so most towns will treat Monday November 2 as the day, subject to the local grace period. Around that date past clients look at the bill and call the one real estate person they know. Watchdog puts the answer in front of you: the assessment history for the property, the town's tax rate by year, and the Chapter 123 ratio, each with a source and date. If the assessment moved, you see when. If the town revalued, you see that too. You explain it plainly and you sound like the agent who knows the property, because you do. Start your 14-day Agent trial before the bills land. Card required, $59 per month after day 14 unless cancelled, reminder three days before the first charge, one-click cancel from Account. Watchdog is not a tax-appeal conclusion, and always confirm dates with the tax collector.
- Headline: Nov 1: tax bills, then questions
- Description: Start your 14-day Agent trial
- CTA button: Sign up
- Destination: https://www.watchdogindex.com/agents/trial?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-1&utm_content=ad-m-017
- Creative: CR-02
- Compliance note: Date confirmed in the brief. Grace period caveat. Not a tax-appeal conclusion.

#### AD-M-018
- Phase: 1
- Angle: The Monday desk reason to reach out (Nov 2 deadline)
- Audience: INT
- Primary text (short): Nov 2 is the PAS-1 and ANCHOR filing deadline. Some past clients still have not filed. That is a reason to reach out.
- Primary text (long): November 2 is the filing deadline for the 2025 PAS-1 and ANCHOR application season. Some of your past clients have not filed yet, and a reminder from the agent who sold them the house is more welcome than most of what lands in their inbox. Opportunity Desk surfaces tax-relief deadlines as one of its reasons to reach out, next to assessment changes, revaluations, permits, and nearby verified sales. Each card gives you homeowner-safe wording and a next action, so the message is helpful and short. This is not about selling anything. It is about being useful to people who already know you, on a date that matters to them. That is the whole idea behind the Agent plan. Start your 14-day Agent trial. Card required, $59 per month after day 14 unless cancelled, reminder three days before the first charge, one-click cancel from Account. Eligibility for relief programs is set by the state, not by Watchdog.
- Headline: A deadline your past clients care about
- Description: Reasons to reach out, weekly
- CTA button: Sign up
- Destination: https://www.watchdogindex.com/agents/trial?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-1&utm_content=ad-m-018
- Creative: CR-03
- Compliance note: Deadline from Watchdog's own tax calendar. No eligibility claims. No owner contact data.

---

### Phase 2: proof and scale (AD-M-019 to AD-M-028)

Proof ads use only the approved quote or a bracketed placeholder. Do not run AD-M-020 until a real, signed-off quote replaces the placeholder.

#### AD-M-019
- Phase: 2
- Angle: Walk in knowing (proof)
- Audience: INT
- Primary text (short): "The property story is already there when I need it." NJ real estate agent. Assessment, taxes, permits, sales. One view.
- Primary text (long): "The property story is already there when I need it." That is how one New Jersey real estate agent described Watchdog, and it is the plainest description we have. Before an appointment you open the property and the story is there: the assessment by year, the tax history, the town's Chapter 123 ratio, the revaluation status, verified sales nearby, permits, and the flood or environmental screen, each with a source and date. Nothing to assemble from six county websites. When the client asks a question, you answer from the record. The Agent plan also includes Opportunity Desk, which gives you a real reason to reach out to past clients each week, monitoring for up to 25 properties, and Postcard Studio at $1.79 per card for your farm. Start your 14-day Agent trial. Card required, $59 per month after day 14 unless cancelled, reminder three days before the first charge, one-click cancel from Account. Not an appraisal or a legal opinion.
- Headline: The property story, already there
- Description: Start your 14-day Agent trial
- CTA button: Sign up
- Destination: https://www.watchdogindex.com/agents/trial?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-2&utm_content=ad-m-019
- Creative: CR-01 with the approved quote as an overlay
- Compliance note: Only approved quote and attribution used.

#### AD-M-020
- Phase: 2
- Angle: The Monday desk reason to reach out (proof placeholder)
- Audience: LAL
- Primary text (short): "[Real quote about a past-client conversation that started from an Opportunity Desk card.]" [Agent name, Brokerage, Town]
- Primary text (long): "[Real quote, two or three sentences, about a specific past-client conversation that started from an Opportunity Desk card. Must be a real Founding Agent, signed off in writing, no results claims.]" [Agent name, Brokerage, Town]. That is what Opportunity Desk is for. Every Monday it shows which of your past clients have a property reason to hear from you this week: an assessment change with the source date, a town reassessment, a permit that closed, a verified sale on their street, an approaching appeal or relief deadline. Each card gives the reason, the confidence, homeowner-safe wording, and a next action. It is not a guess about what anyone plans to do. It is a real reason to reach out, from the public record, to someone who already knows you. Start your 14-day Agent trial. Card required, $59 per month after day 14 unless cancelled, reminder three days before the first charge, one-click cancel from Account. Sample data shown in the image.
- Headline: A real reason to call a past client
- Description: Opportunity Desk, weekly
- CTA button: Sign up
- Destination: https://www.watchdogindex.com/agents/trial?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-2&utm_content=ad-m-020
- Creative: CR-03 with quote overlay [designer adds only after the quote is real]
- Compliance note: Placeholder quote. Do not run until replaced with a signed-off real quote. No results claims allowed in the quote.

#### AD-M-021
- Phase: 2
- Angle: Tax bill translator (Dec 1 added assessment deadline)
- Audience: INT
- Primary text (short): Dec 1 is the added-assessment appeal deadline in NJ. If a client finished a renovation this year, they should know.
- Primary text (long): A client finished an addition or a major renovation this year. Their town can issue an added assessment for the new value, prorated, and the bill often lands in the fall with a short fuse. The deadline to appeal an added or omitted assessment at the County Board of Taxation is December 1, or 30 days from the bulk mailing of the added-assessment bills, whichever is later. Most homeowners have never heard of it. The agent who tells them in November is the agent they remember. Watchdog flags permit lifecycle changes and approaching appeal deadlines on Opportunity Desk, and the property view shows the assessment history with sources so you can explain what changed. Watchdog does not tell anyone whether to appeal or predict an outcome; that is between the owner, the county board, and their advisor. Start your 14-day Agent trial. Card required, $59 per month after day 14 unless cancelled, reminder three days before the first charge, one-click cancel.
- Headline: Dec 1: added assessment deadline
- Description: A reason to reach out now
- CTA button: Sign up
- Destination: https://www.watchdogindex.com/agents/trial?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-2&utm_content=ad-m-021
- Creative: CR-02 with Dec 1 date overlay
- Compliance note: Deadline wording matches the brief. Explicitly not an appeal recommendation.

#### AD-M-022
- Phase: 2
- Angle: Farm postcards at $1.79 (holiday mailer)
- Audience: INT
- Primary text (short): A December farm postcard with a real property fact for the street. $1.79 per card, printing and postage in. Sample shown.
- Primary text (long): Most December farm mailers say happy holidays and nothing else. Yours can say happy holidays and one useful thing: the town's 2027 assessment notices go out around February 1, here is what the ratio looks like now, here is how to reach me if you have a question. Postcard Studio builds the list from your farm on the map, you design a 6 by 8.5 card, proof it, and it mails First Class. $1.79 per card on the Agent plan, printing and postage included, minimum 50 mailable addresses. Cards go to Current Resident because owner names are not public in New Jersey. Undeliverable cards come back as mail credit. Put your name, brokerage, and any broker-required disclosure on the card. To mail before the holiday rush, proof by [date from Postcard Studio production calendar]. Start your 14-day Agent trial and send the first mailer inside the trial. Card required, $59 per month after day 14 unless cancelled, one-click cancel.
- Headline: A December mailer worth reading
- Description: $1.79 per card, postage in
- CTA button: Sign up
- Destination: https://www.watchdogindex.com/agents/trial?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-2&utm_content=ad-m-022
- Creative: CR-04 with a holiday sample card
- Compliance note: Current Resident, disclosure, minimum stated. Production date is a placeholder.

#### AD-M-023
- Phase: 2
- Angle: PropStream alternative for NJ
- Audience: INT
- Primary text (short): Paying for fifty states of data to work one? Watchdog does New Jersey at full depth, source attached. Compare the job.
- Primary text (long): If you are paying for a national prospecting platform and you only work New Jersey, it is worth asking what you actually use. Watchdog does one state at full depth: assessment and tax history by year, the Chapter 123 ratio for all 564 municipalities, revaluation and reassessment status, added and omitted assessments, 131,244 verified SR1A sales, permits, municipal context, and flood or environmental screening, with the source and date on every number. It does not do national research, and it does not sell owner phone numbers, skip tracing, or contact lists. We wrote a plain comparison page that dates every figure and says where Watchdog is not the right fit. Read it, then decide. If the job is New Jersey and the need is evidence beside the MLS, the Agent plan is $59 per month or $590 per year, and there is a 14-day trial with a card on file that you can cancel in one click. Watchdog is our product; the comparison says so.
- Headline: Compare the job, not the bill
- Description: Dated comparison, disclosed
- CTA button: Learn more
- Destination: https://www.watchdogindex.com/pricing/propstream?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-2&utm_content=ad-m-023
- Creative: CR-05
- Compliance note: Competitor named only in the description, no competitor price, editorial disclosure carried over. Destination page already has the disclosure.

#### AD-M-024
- Phase: 2
- Angle: Founder story (referral reward)
- Audience: LAL
- Primary text (short): A month of Watchdog on me when a professional you invite starts a yearly plan. It is already in the product. Here is how.
- Primary text (long): Quick one from me. The referral reward is live in the product: when a professional you invite starts a yearly plan, you get one month of your own plan free, credited after their plan has been active 90 days. Your invite link is on the account page. I mention it because the agents who like Watchdog tend to like it for a specific reason: they walked into an appointment already knowing the assessment history, or a past client called about a tax bill and they had the answer with the source. That kind of thing gets passed along to the office anyway. If you are not on Watchdog yet, start your 14-day Agent trial. Card required, $59 per month after day 14 unless cancelled, reminder three days before the first charge, one-click cancel from Account. If it is not useful in two weeks, cancel and you pay nothing. Reply to the welcome email with questions. John.
- Headline: The referral reward, explained
- Description: Start your 14-day Agent trial
- CTA button: Sign up
- Destination: https://www.watchdogindex.com/agents/trial?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-2&utm_content=ad-m-024
- Creative: SV founder short [confirm SV ID in 03-social]; fallback CR-12
- Compliance note: Referral terms exactly as the brief states them (yearly plan, 90 days).

#### AD-M-025
- Phase: 2
- Angle: Founding Agent scarcity (100 seats)
- Audience: INT
- Primary text (short): [N] of 100 Founding Agent seats are still open for New Jersey. Request an invite before the cohort closes.
- Primary text (long): [N] of the 100 Founding Agent seats are still open. The cohort is the first 100 paying New Jersey agents on Watchdog, and it closes when the seats are gone. Same Agent plan as everyone: Agent Desk, Opportunity Desk with a real reason to reach out to past clients each week, Property Lookup with the Watchdog Score, monitoring for up to 25 properties, Postcard Studio at $1.79 per card, and Agent Academy. Founding Agents get a direct line to me while the product is being shaped, and a say in what gets built next. Request a Founding Agent invite and you get a code for an invite-only trial. No card is needed to request it. When you decide to stay it is $59 per month or $590 per year. The number in this ad is updated every Tuesday from the actual count. Watchdog is New Jersey property intelligence, not an MLS, appraisal, or legal opinion.
- Headline: [N] Founding Agent seats left
- Description: New Jersey only, invite code
- CTA button: Apply now
- Destination: https://www.watchdogindex.com/agents/trial?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-2&utm_content=ad-m-025
- Creative: CR-06 with live count overlay
- Compliance note: [N] must be the real count, updated weekly by the Coordinator. Pause the ad when seats reach zero.

#### AD-M-026
- Phase: 2
- Angle: The Monday desk reason to reach out (weekly email)
- Audience: EMP
- Primary text (short): One email every week: the ten past clients with the biggest property reason to hear from you. Sample shown.
- Primary text (long): Every week Watchdog sends one email: the ten highest-value new reasons to reach out across the properties you follow. A past client's town announced a reassessment. An assessment moved above the peer band, source dated. A permit closed. A verified sale recorded three doors down. A relief or appeal deadline is coming up. Each item has the reason, the confidence, wording that is safe to say to a homeowner, and a next action. You read it Monday morning with coffee and make three calls that are actually about something. It is not a list of people who want to sell. It is your own clients, and a property fact that gives you a reason to be useful. Start your 14-day Agent trial. Card required, $59 per month after day 14 unless cancelled, reminder three days before the first charge, one-click cancel from Account. Add your past clients first. Sample items shown in the image.
- Headline: Ten reasons to reach out, weekly
- Description: Start your 14-day Agent trial
- CTA button: Sign up
- Destination: https://www.watchdogindex.com/agents/trial?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-2&utm_content=ad-m-026
- Creative: CR-03
- Compliance note: "Not a list of people who want to sell" stated. Own clients only.

#### AD-M-027
- Phase: 2
- Angle: Walk in knowing (Watchdog Score)
- Audience: INT
- Primary text (short): Watchdog Score 72 of 100, evidence beside it. Sample property. Six things about a NJ property, one number to start from.
- Primary text (long): The Watchdog Score is a 0 to 100 read on a New Jersey property's assessment and tax position, powered by the ROBUST Framework: Recourse, Overassessment Position, Burden, Uniformity, Stability, Trajectory. The score is the starting point. The evidence sits beside it: the assessment history, the Chapter 123 ratio, the tax burden against peers, the town's revaluation status, and where the trajectory has been going, each with a source and date. On the sample card in this ad the score is 72 and Uniformity reads 62. Those are sample figures. What the score does is give you one number to open the conversation and six facts to back it up. It is not an appraisal, not a list price, and not a tax-appeal conclusion. Start your 14-day Agent trial and score any property in the state. Card required, $59 per month after day 14 unless cancelled, reminder three days before the first charge, one-click cancel from Account.
- Headline: The Watchdog Score, explained
- Description: Evidence beside the number
- CTA button: Sign up
- Destination: https://www.watchdogindex.com/agents/trial?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-2&utm_content=ad-m-027
- Creative: CR-10
- Compliance note: Exact methodology phrase used. Sample labeled. Not an appraisal.

#### AD-M-028
- Phase: 2
- Angle: Tax bill translator (Town Compare, revaluation)
- Audience: INT
- Primary text (short): Which of your towns is revaluing for 2027? Town Compare shows status, ratio, and effective rate side by side.
- Primary text (long): A revaluation changes every assessment in a town at once, and the questions start the week the notices land. Town Compare shows which of the towns you work are revaluing or reassessing, what the Chapter 123 ratio is now, and the effective tax rate, side by side, with the source year on each figure. Compare a revalued town with a neighbor that has not revalued in a decade and you can explain, in measurement language, why two similar houses carry different bills. No town is called good or bad. The comparison is free to view; on the Agent plan you save the comparison, attach it to a property report, and watch the towns you work for changes. Start your 14-day Agent trial. Card required, $59 per month after day 14 unless cancelled, reminder three days before the first charge, one-click cancel from Account. Assessments are tax-administration values, not list prices.
- Headline: Which towns are revaluing for 2027
- Description: Town Compare, side by side
- CTA button: Sign up
- Destination: https://www.watchdogindex.com/agents/trial?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-2&utm_content=ad-m-028
- Creative: CR-11
- Compliance note: Measurement language. No town named or ranked.

---

### Phase 3: Triple Play and year end (AD-M-029 to AD-M-036)

#### AD-M-029
- Phase: 3
- Angle: Triple Play meetup
- Audience: TP (radius, Dec 5 to 11) and INT (Dec 1 to 10)
- Primary text (short): At Triple Play Dec 7 to 10? Find John at [booth or meeting spot] and see your own farm in Watchdog on the spot.
- Primary text (long): Triple Play runs December 7 to 10 at the Atlantic City Convention Center. I will be there with a laptop. Bring the address of a listing you are working, or a past client's house, and I will pull it up in Watchdog while you watch: the assessment history, the town's ratio and revaluation status, verified sales nearby, permits, and the Watchdog Score with the evidence beside it. Five minutes, no pitch, and you leave knowing more about that property than you did. Find me at [booth number or meeting spot, confirm after registration]. If you would rather try it on your own phone first, start your 14-day Agent trial and I will look at whatever you saved when we meet. Card required, $59 per month after day 14 unless cancelled, reminder three days before the first charge, one-click cancel from Account. Registration is through the Triple Play site, not through us. John.
- Headline: Find John at Triple Play, Dec 7 to 10
- Description: Bring an address
- CTA button: Learn more
- Destination: https://www.watchdogindex.com/agents/trial?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-3&utm_content=ad-m-029
- Creative: CR-09
- Compliance note: Booth placeholder must be filled before launch. No giveaway or contest language unless legal reviews it.

#### AD-M-030
- Phase: 3
- Angle: Triple Play meetup (day of)
- Audience: TP
- Primary text (short): You are at Triple Play. So is Watchdog. [Booth or spot], today until [time]. Bring an address, leave with the story.
- Primary text (long): You are at the Atlantic City Convention Center this week. So am I. Watchdog is New Jersey property intelligence for agents: one property view with the assessment and tax history, the Chapter 123 ratio, revaluation status, verified sales, permits, and town context, with the source and date next to every number. Stop by [booth number or meeting spot] any time until [time] today. Bring one address, a listing or a past client, and I will show you the story on that property in five minutes. If you are on your way out, start your 14-day Agent trial on your phone and I will answer questions by email this week. Card required, $59 per month after day 14 unless cancelled, reminder three days before the first charge, one-click cancel from Account. Cancel before day 14 and you pay nothing. The property view is free to look at; the plan adds the desk and the mailers. See you on the floor. John.
- Headline: Watchdog is at Triple Play today
- Description: [Booth or spot], until [time]
- CTA button: Learn more
- Destination: https://www.watchdogindex.com/agents/trial?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-3&utm_content=ad-m-030
- Creative: CR-09 (Stories 1080x1920 primary)
- Compliance note: Runs only Dec 7 to 10, radius only. Placeholders filled daily.

#### AD-M-031
- Phase: 3
- Angle: Year-end expense
- Audience: INT
- Primary text (short): $590 for the year. Ten monthly payments for twelve months, and a 2026 business expense if paid before Dec 31.
- Primary text (long): The Agent annual plan is $590 a year, which is ten monthly payments for twelve months of Watchdog. Pay before December 31 and it lands in your 2026 books; whether and how you expense it is a question for your accountant, not for us. What you get for the year: Agent Desk, Opportunity Desk with a real reason to reach out to past clients every week, Property Lookup with the Watchdog Score for any New Jersey property, monitoring for up to 25 properties, Postcard Studio at $1.79 per card for your farm, Town Compare, professional reports, and Agent Academy. Assessment notices for 2027 go out around February 1 and the regular appeal deadline is April 1; the agents who know their clients' towns before then will get the calls. If you have never used it, start your 14-day Agent trial first and switch to annual from Account before the first charge. Card required, $59 per month after day 14 unless cancelled.
- Headline: $590 a year. Expense it in 2026.
- Description: Ten payments, twelve months
- CTA button: Get offer
- Destination: https://www.watchdogindex.com/pro?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-3&utm_content=ad-m-031
- Creative: CR-08
- Compliance note: No tax advice; says ask your accountant. Annual math matches the brief (ten monthly payments).

#### AD-M-032
- Phase: 3
- Angle: Year-end expense
- Audience: RT (site visitors and trial non-converters)
- Primary text (short): You looked at Watchdog this fall. Annual is $590, ten monthly payments for the year, and it can be a 2026 expense.
- Primary text (long): You looked at Watchdog this fall and did not start. Fair enough. Here is the year-end version of the offer, with no new pitch: the Agent annual plan is $590, which is ten monthly payments for twelve months, and if you pay before December 31 it is a 2026 business expense (ask your accountant how to treat it). The plan is what you saw: one property view for any New Jersey address with the assessment and tax history, Chapter 123 ratio, revaluation status, verified sales, permits, and town context, source on every number; Opportunity Desk with a weekly reason to reach out to past clients; monitoring for up to 25 properties; Postcard Studio at $1.79 per card; Agent Academy. If you would rather test it first, start your 14-day Agent trial and switch to annual from Account before the first charge. Card required, $59 per month after day 14 unless cancelled, one-click cancel.
- Headline: Annual before Dec 31: $590
- Description: Or start the 14-day trial
- CTA button: Get offer
- Destination: https://www.watchdogindex.com/pro?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-3&utm_content=ad-m-032
- Creative: CR-08
- Compliance note: Retargeting only; "you looked at Watchdog" must be true for the pool. No tax advice.

#### AD-M-033
- Phase: 3
- Angle: Walk in knowing (2027 appeal season prep)
- Audience: INT
- Primary text (short): 2027 assessment notices go out around Feb 1. The agent who knows the town's ratio before then gets the call.
- Primary text (long): New Jersey mails 2027 assessment notices around February 1. The regular appeal deadline is April 1, May 1 in towns that completed a revaluation or reassessment, and January 15 in Monmouth, Gloucester, and Burlington on the alternate calendar; always confirm with the county board. Between the notice and the deadline, homeowners call the real estate person they know and ask whether the number is right. Watchdog is how you have an answer: the assessment history, the town's Chapter 123 ratio and where the property sits against it, verified sales nearby, and the Watchdog Score with the evidence beside it. You are not giving a tax-appeal conclusion; you are showing the record and pointing them to the county board or an advisor. That is a conversation worth having in January. Start your 14-day Agent trial now and add your past clients before the notices land. Card required, $59 per month after day 14 unless cancelled, one-click cancel.
- Headline: Get ready for 2027 appeal season
- Description: Start your 14-day Agent trial
- CTA button: Sign up
- Destination: https://www.watchdogindex.com/agents/trial?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-3&utm_content=ad-m-033
- Creative: CR-10
- Compliance note: Dates from the brief with the county-board caveat. Not a tax-appeal conclusion.

#### AD-M-034
- Phase: 3
- Angle: Founder story (year-end note)
- Audience: LAL
- Primary text (short): A year-end note from John: what the first Founding Agents actually used, and what is coming for 2027 appeal season.
- Primary text (long): A short year-end note. Watchdog opened to New Jersey agents in October. The Founding Agents used three things more than anything else: the property view before an appointment, the Monday Opportunity Desk email, and Postcard Studio for their farms at $1.79 per card. [Replace this sentence with one real, signed-off usage fact from product analytics, or delete it.] For 2027 appeal season we are adding [feature placeholder, confirm with product before running]. If you have been meaning to try it, this is a good time: start your 14-day Agent trial, work through Agent Academy, and add your past clients before the February notices. Card required, $59 per month after day 14 unless cancelled, reminder three days before the first charge, one-click cancel from Account. If you want the annual plan instead, it is $590 for the year. The trial works through Agent Academy, eight short lessons. Thank you for a good first quarter. John.
- Headline: A year-end note from John
- Description: Start your 14-day Agent trial
- CTA button: Sign up
- Destination: https://www.watchdogindex.com/agents/trial?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-3&utm_content=ad-m-034
- Creative: SV founder year-end video [confirm SV ID in 03-social]; fallback CR-12
- Compliance note: Two placeholders must be filled or deleted before launch. No invented usage numbers.

#### AD-M-035
- Phase: 3
- Angle: Founding Agent scarcity (last seats)
- Audience: LIST
- Primary text (short): [N] Founding Agent seats remain and the cohort closes Dec 31. If you were waiting, this is the last week.
- Primary text (long): The Founding Agent cohort closes December 31 or when the 100 seats are gone, whichever comes first, and [N] seats remain. You are on the launch list, so this is the last direct reminder. Founding Agents get the Agent plan, $59 per month or $590 per year, plus a direct line to me while the product is being shaped and a say in what gets built for 2027 appeal season. Request a Founding Agent invite and you get a code for an invite-only trial; no card is needed to request it. If the seats are gone by the time you read this, the regular 14-day Agent trial is still open, card required, $59 per month after day 14 unless cancelled, one-click cancel. Either way, add your past clients before the February assessment notices. Watchdog is New Jersey property intelligence, not an MLS, appraisal, or legal opinion. Seats go in the order requests arrive. John.
- Headline: Last week for Founding Agent seats
- Description: [N] remain, closes Dec 31
- CTA button: Apply now
- Destination: https://www.watchdogindex.com/agents/trial?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-3&utm_content=ad-m-035
- Creative: CR-06 with live count
- Compliance note: Run only if seats remain. Close date must match the actual cohort decision in 01-strategy.

#### AD-M-036
- Phase: 3
- Angle: Triple Play meetup (follow-up)
- Audience: TP (post-event pool, Dec 11 to 31)
- Primary text (short): We may have met at Triple Play. Here is the property view I was showing, and the 14-day Agent trial to try it yourself.
- Primary text (long): If we talked at Triple Play last week, thank you for stopping by. If we did not, you were probably in the same building. Either way, this is the thing I was showing on the laptop: one property view for any New Jersey address with the assessment and tax history, the Chapter 123 ratio, revaluation status, verified sales, permits, and town context, with the source and date on every number, plus the Watchdog Score with the evidence beside it. The Agent plan adds Opportunity Desk, which gives you a real reason to reach out to past clients each week, monitoring for up to 25 properties, and Postcard Studio at $1.79 per card. Start your 14-day Agent trial and pull up the address we talked about. Card required, $59 per month after day 14 unless cancelled, reminder three days before the first charge, one-click cancel from Account. Questions, reply to the welcome email and it comes to me. John.
- Headline: From the Triple Play floor
- Description: Start your 14-day Agent trial
- CTA button: Sign up
- Destination: https://www.watchdogindex.com/agents/trial?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-3&utm_content=ad-m-036
- Creative: CR-09 variant with post-event line, or CR-01
- Compliance note: "We may have met" avoids claiming a contact that did not happen.

## 6. Testing plan

### What to test first: hook, then angle

Week 1 of Phase 1 (Oct 12 to 18) tests hooks, not angles. Take the walk-in-knowing angle (AD-M-007) and run three creative hooks against it in one ad set: the sample card (CR-01), the trial disclosure card (CR-07), and the founder on camera (SV video). Same audience, same copy, same landing page. This tells us whether NJ agents respond to a product fact, a plain offer, or a person, and that answer shapes every later creative.

Week 2 (Oct 19 to 25) tests angles with the winning hook style: walk in knowing (AD-M-007), Monday desk (AD-M-010), postcards (AD-M-012), tax bill translator (AD-M-009). One ad set, four ads, winning hook style on each.

Week 3 onward: the two best angles get two new creatives each every two weeks (refresh dates in `calendar-feed-paid.csv`). Losers are archived, not deleted, so their data stays in the account.

### How many creatives per ad set

Three to four ads per ad set. Fewer than three and Meta cannot pick; more than five and the losers starve before they get a fair read. Each ad set needs about $150 of spend before a creative decision is made, which on the Recommended tier is about a week.

### When to kill

- Ad: link CTR under 0.6 percent after 4,000 impressions, or cost per landing page view above $4 after $60 spend.
- Ad set: rules in `paid-media-strategy.md`, section 7 (zero trial starts after $250, cost per trial above $120 after $360).
- Never kill on the day a creative launches; Meta's learning phase produces bad first-day numbers.

### When to scale

- An ad set with 5 or more trial starts at or under $60 each in the prior 7 days gets a 20 percent budget increase, once a day at most, for as long as it holds the number.
- Duplicate the winning ad into a new audience (INT to EMP, or INT to LAL) rather than raising one ad set past $120 a day, because NJ frequency climbs fast.
- Frequency above 4 in 7 days on prospecting means the audience is saturating; add a creative before adding budget.

### Reporting

Every Tuesday 09:00, per the calendar: spend, impressions, frequency, link CTR, CPC, landing page views, `trial_started`, `founding_invite_requested`, cost per each, by ad set and ad. Decisions written in the weekly report in `utm-and-tracking.md`, section 9.
