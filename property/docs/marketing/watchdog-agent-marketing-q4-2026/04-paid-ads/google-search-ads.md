# Google Search ads: Watchdog Agent plan, Q4 2026

Follows `00-brief/product-and-brand-brief.md` and `paid-media-strategy.md`. Google Search is the second channel in every tier. It is small in volume and high in intent: agents typing a competitor name or a New Jersey tax term are already looking for what Watchdog does. The risk is homeowner traffic, which is why the negative lists below matter more than the keyword lists.

## 1. Account structure

One campaign, `Q4-SEARCH-NJ-AGENTS`, six ad groups, Search network only (no Display expansion, no search partners). Renamed per phase for reporting: `Q4-P1-SEARCH`, `Q4-P2-SEARCH`, `Q4-P3-SEARCH`. Conversion actions imported from GA4 (see `utm-and-tracking.md`): `trial_started` primary, `founding_invite_requested` primary on Variant B, `free_account_created` and `checkout_started` secondary.

| Ad group | Code | Job | Landing URL |
| --- | --- | --- | --- |
| Brand | BRAND | Protect the name, catch people who heard of it elsewhere | `/agents/trial` (Phase 0: `/for/real-estate-agents`) |
| NJ property tax intent for agents | INTENT | Agents researching NJ assessment, Chapter 123, deadlines | `/agents/trial` (Phase 0: `/free`) |
| Competitor | COMP | Agents evaluating PropStream, PropertyRadar, PropertyShark | `/pricing/propstream` and sibling pages, then `/agents/trial` from the page |
| Agent tools | TOOLS | Farming, postcards, past-client follow-up software | `/agents/trial` |
| Town compare | TOWN | Town-level tax comparisons, heavy homeowner risk | `/town-compare` |
| Triple Play | TP | Convention searches, Dec 1 to 11 only | `/agents/trial` |

UTM pattern for every final URL: `?utm_source=google&utm_medium=cpc&utm_campaign=q4-agents-<phase>&utm_content=ad-g-<group>` with `{keyword}` passed in `utm_term` through the tracking template: `{lpurl}?utm_source=google&utm_medium=cpc&utm_campaign=q4-agents-1&utm_content=ad-g-{_group}&utm_term={keyword}`. Set `_group` as a custom parameter on each ad group (brand, intent, comp, tools, town, tp). Ad IDs are AD-G-BRAND, AD-G-INTENT, AD-G-COMP, AD-G-TOOLS, AD-G-TOWN, AD-G-TP (one responsive search ad per group, plus a second ad in the two largest groups from Phase 2).

## 2. Daily budgets by tier

Campaign-level daily budget, split by ad group using ad group bid caps and shared budgets. Weekly totals reconcile to `budget-and-pacing.csv`.

| Ad group | Lean (about $17/day in Phase 1) | Recommended (about $31/day) | Aggressive (about $63/day) |
| --- | --- | --- | --- |
| BRAND | $2 | $3 | $5 |
| INTENT | $5 | $9 | $18 |
| COMP | $4 | $8 | $16 |
| TOOLS | $3 | $6 | $12 |
| TOWN | $2 | $3 | $6 |
| TP (Dec 1 to 11 only) | $2 (from INTENT) | $2 | $6 |

Phase 0 (Oct 5 to 11 only): BRAND and INTENT at half the Phase 1 rate, everything else paused. Thanksgiving week: 60 percent. Dec 24 to 27: BRAND only.

## 3. Ad groups

### BRAND (AD-G-BRAND)

Keywords (exact in brackets, phrase in quotes):

[watchdog index], [watchdogindex], [watchdogindex.com], [watchdog index nj], "watchdog index property", [watchdog property intelligence], [watchdog nj property], [watchdog score], [watchdog score nj], "watchdog score property", [robust framework watchdog], [watchdog agent desk], [watchdog opportunity desk], [watchdog postcard studio], [watchdog town compare], [watchdog index pricing], [watchdog index agent plan], [watchdog index trial], [watchdog index login], [watchdog index reviews], [watchdog for real estate agents], [watchdog index real estate agents], [the tax watchdog], [tax watchdog nj], [thetaxwatchdog], [john scafide], "john scafide watchdog", [watchdog intelligence nj], [watchdog move nj], [nj property tax relief watchdog]

Negatives (ad group level): "watchdog camera", "watch dog camera", "watchdogs game", "watch dogs", "ubisoft", "consumer watchdog", "watchdog timer", "watchdog software linux", "dog", "puppy", "breed", "watchdog journalism", "watchdog group", "watchdog report"

Headlines (15):
1. Watchdog for NJ agents
2. Watchdog official site
3. Start your 14-day Agent trial
4. Founding Agent invites open
5. Agent plan, $59 per month
6. Source on every number
7. 564 NJ municipalities covered
8. The Watchdog Score, 0 to 100
9. Assessment and tax history
10. Chapter 123 context included
11. Built for New Jersey only
12. Postcards at $1.79 per card
13. Monitor up to 25 properties
14. Cancel in one click
15. Founder: John Scafide

Descriptions (4):
1. NJ property intelligence for agents: assessment, tax history, permits, verified sales.
2. 14-day Agent trial, card required, $59 per month after day 14 unless cancelled.
3. Opportunity Desk gives you a real reason to reach out to past clients every week.
4. Postcard Studio: 6 x 8.5 cards mailed First Class for $1.79 each, postage included.

Pin headline 1 or 2 to position 1. Pin description 2 to position 2 in Phase 1 onward.

Sitelinks: Agent plan details (`/pro`), Agent field guide (`/real-estate-agents`), Town Compare (`/town-compare`), Data methodology (`/data-methodology`).
Callouts: New Jersey only, Source on every number, 14-day Agent trial, Cancel in one click.
Structured snippet, header "Features": Agent Desk, Opportunity Desk, Watchdog Score, Postcard Studio, Town Compare, Agent Academy.

Final URL: `https://www.watchdogindex.com/agents/trial` (Phase 0: `https://www.watchdogindex.com/for/real-estate-agents`).

### INTENT (AD-G-INTENT)

Keywords:

"nj property tax records", "new jersey property tax records", "nj assessment lookup", "nj property assessment lookup", "new jersey assessment records", "nj tax assessment history", "nj property tax history by address", "chapter 123 ratio nj", [chapter 123 ratio], "nj chapter 123", "chapter 123 new jersey", "nj equalization ratio 2026", "equalization ratio nj", "nj equalization ratios by town", "nj tax appeal deadline", "new jersey tax appeal deadline 2027", "tax appeal deadline nj 2027", "added assessment nj", "nj added assessment appeal", "omitted assessment nj", "added assessment appeal deadline", "nj revaluation 2026", "nj reassessment 2027", "nj revaluation list", "nj mod iv records", [mod-iv nj], "nj sr1a sales", [sr1a nj], "nj property record search", "nj property tax lookup by address", "nj assessment to sales ratio", "nj tax rate by town 2026", "new jersey property tax rates by municipality", "nj effective tax rate by town", "nj property tax comparison"

Negatives: "anchor benefit status", "anchor status", "anchor benefit", "senior freeze application", "senior freeze", "pas-1", "stay nj", "pay my property tax", "pay property tax online", "tax collector", "wipp", "bill pay", "property tax reimbursement", "veteran deduction", "senior deduction", "exemption", "tax sale", "tax lien", "assessor job", "jobs", "salary", "how to appeal my", "my property taxes", "my assessment", "attorney", "lawyer", "law firm", "class action", "grievance"

Headlines (15):
1. NJ tax records with sources
2. Chapter 123 ratio, every town
3. Assessment history by address
4. Added assessments, explained
5. Revaluation status, 564 towns
6. Equalization ratios by town
7. For NJ real estate agents
8. Verified SR1A sales on file
9. Start your 14-day Agent trial
10. Free property lookup
11. Source and date attached
12. Explain a tax bill fast
13. Not a tax-appeal conclusion
14. Permits, sales, town context
15. Watchdog Score, 0 to 100

Descriptions (4):
1. Assessment, tax rate, and Chapter 123 ratio for any NJ property, with source and date.
2. Built for New Jersey agents. Know the property before the listing appointment.
3. Free property lookup, or start your 14-day Agent trial. $59 per month after day 14.
4. Watchdog is not an appraisal or a tax-appeal conclusion. It shows the public record.

Sitelinks: Agent field guide (`/real-estate-agents`), Town Compare (`/town-compare`), Data methodology (`/data-methodology`), Plans (`/pro`).
Callouts: For NJ agents, Chapter 123 context, Revaluation tracking, Source on every number.
Structured snippet, header "Types": Assessment history, Tax history, Chapter 123 ratio, Verified sales, Permits, Flood screening.

Final URL: `https://www.watchdogindex.com/agents/trial` (Phase 0: `https://www.watchdogindex.com/free`).

### COMP (AD-G-COMP)

Keywords:

"propstream alternative", "propstream alternatives", "propstream pricing", "propstream cost", "propstream review", "propstream reviews", "propstream vs", "propstream new jersey", "propstream nj", "propstream free trial", "is propstream worth it", "propstream for real estate agents", "propstream vs propertyradar", "propstream vs propertyshark", "propertyradar new jersey", "propertyradar nj", "propertyradar pricing", "propertyradar alternative", "propertyradar review", "propertyshark nj", "propertyshark new jersey", "propertyshark pricing", "propertyshark alternative", "propertyshark review", "attom data pricing", "attom alternative", "regrid pricing", "regrid nj", "regrid alternative", "property data software nj", "nj property data platform", "real estate data software new jersey", "property research software for realtors"

Negatives: "login", "log in", "sign in", "app download", "customer service", "support phone", "cancel subscription", "refund", "coupon", "promo code", "discount code", "api documentation", "careers", "affiliate", "wholesaling", "wholesale", "skip tracing", "skip trace", "foreclosure list", "investor list"

Headlines (15):
1. PropStream alternative for NJ
2. New Jersey deep, not wide
3. Compare the job, not the bill
4. Agent plan, $59 per month
5. Dated pricing comparison
6. PropertyRadar vs Watchdog
7. PropertyShark vs Watchdog
8. Chapter 123, revaluations
9. Source on every number
10. No owner contact lists sold
11. Start your 14-day Agent trial
12. Built for NJ agents only
13. Editorial disclosure on page
14. 564 NJ municipalities
15. Assessment and tax history

Descriptions (4):
1. National tools go wide. Watchdog goes NJ deep, with the source on every number.
2. Every competitor figure is dated. We say where Watchdog is not the right fit.
3. Agent plan $59 per month. 14-day trial, card required, cancel in one click.
4. Watchdog does not sell owner phone numbers, skip tracing, or contact lists.

Use headline 1 with PropStream keywords, 6 with PropertyRadar, 7 with PropertyShark through three ad variants or ad customizers; never show a PropertyRadar headline on a PropStream query.

Sitelinks: PropStream comparison (`/pricing/propstream`), PropertyRadar comparison (`/pricing/propertyradar`), PropertyShark comparison (`/pricing/propertyshark`), Agent plan (`/pro`).
Callouts: Dated figures, Editorial disclosure, NJ only, 14-day Agent trial.
Structured snippet, header "Features": Assessment history, Chapter 123 ratio, Revaluation status, Verified sales, Permits, Postcard Studio.

Final URL: `https://www.watchdogindex.com/pricing/propstream` for PropStream terms, the matching sibling page for PropertyRadar, PropertyShark, ATTOM, Regrid terms, and `https://www.watchdogindex.com/agents/trial` for the generic software terms. Competitor pages already carry the editorial disclosure; do not remove it.

### TOOLS (AD-G-TOOLS)

Keywords:

"real estate farming software nj", "real estate farming software", "geographic farming real estate software", "farm marketing real estate nj", "postcard mailing real estate nj", "real estate postcards nj", "real estate postcard service new jersey", "farm postcards real estate", "just listed postcards nj", "real estate farming postcards cost", "how much do real estate postcards cost", "direct mail real estate agents nj", "past client follow up tool real estate", "past client follow up real estate", "sphere of influence follow up tool", "real estate crm nj", "real estate agent software new jersey", "property research tool for realtors", "property research tool real estate agents", "listing appointment preparation tool", "listing presentation property data", "real estate agent property report tool", "property report for real estate agents nj", "property monitoring for realtors", "watch list property changes real estate", "real estate agent tools new jersey", "nj realtor tools", "real estate marketing software nj", "real estate agent research tools", "cma data new jersey"

Negatives: "free", "jobs", "license course", "real estate exam", "real estate school", "template", "canva", "printable", "diy", "commercial", "rental", "property management software", "landlord", "tenant", "zillow", "realtor.com", "training course", "coaching"

Headlines (15):
1. Farm postcards $1.79 each
2. Printing and postage included
3. Draw your farm on the map
4. Past client follow-up, weekly
5. A real reason to reach out
6. Property-triggered reasons
7. NJ agent workspace, $59/month
8. Agent Desk for New Jersey
9. Monitor up to 25 properties
10. Start your 14-day Agent trial
11. Minimum 50 mailable addresses
12. Mailed First Class
13. Source on every number
14. Upload your sphere or CRM
15. Agent Academy, 8 lessons

Descriptions (4):
1. Postcard Studio: design, proof, and mail 6 x 8.5 cards for $1.79 each, postage included.
2. Opportunity Desk: which past clients have a property reason to hear from you this week.
3. Cards mail to Current Resident. Add your name, brokerage, and required disclosures.
4. 14-day Agent trial, card required, $59 per month after day 14 unless cancelled.

Sitelinks: Postcard Studio (`/agent-desk`), Agent Academy (`/agent/training`), Agent field guide (`/real-estate-agents`), Plans (`/pro`).
Callouts: $1.79 per card, Postage included, Current Resident mailing, Cancel in one click.
Structured snippet, header "Features": Farm map, Postcard Studio, Opportunity Desk, Clients, Deals, Marketing Studio.

Final URL: `https://www.watchdogindex.com/agents/trial`.

### TOWN (AD-G-TOWN)

This group attracts homeowners and movers as well as agents. Keep it small, phrase and exact only, and review search terms every week. If agent share of conversions is under 30 percent after $150 spend, cut it to the five "compare" terms only.

Keywords:

"compare nj towns property taxes", "compare property taxes nj towns", "nj towns property tax comparison", "property taxes by town nj", "nj property tax rates by town", "effective tax rate nj towns", "nj town tax rate comparison", "montclair property taxes", "westfield nj property taxes", "summit nj property taxes", "ridgewood nj property taxes", "princeton nj property taxes", "hoboken property taxes", "jersey city property taxes", "morristown property taxes", "cherry hill property taxes", "haddonfield property taxes", "toms river property taxes", "freehold nj property taxes", "red bank nj property taxes", "edison nj property taxes", "bridgewater nj property taxes", "livingston nj property taxes", "millburn property taxes", "short hills property taxes", "chatham nj property taxes", "madison nj property taxes", "moorestown property taxes", "medford nj property taxes", "manalapan property taxes", "marlboro nj property taxes", "wayne nj property taxes", "ramsey nj property taxes", "mahwah property taxes"

Add or swap towns to match the towns of the first 20 trial accounts. Every town keyword is phrase match.

Negatives: "pay", "bill", "collector", "due date", "anchor", "senior freeze", "deduction", "exemption", "tax sale", "lien", "records office", "assessor phone", "assessor office hours", "apartments", "rent", "rentals", "homes for sale", "zillow", "school ratings", "crime", "best place to live", "safest", "worst"

Headlines (15):
1. Compare NJ towns side by side
2. Town Compare, free to use
3. Effective tax rate by town
4. Assessment ratio by town
5. Revaluation status, 2027
6. 564 NJ municipalities
7. Measurement, not opinion
8. Source year on every figure
9. For NJ real estate agents
10. Explain two towns in a minute
11. Send the link to a client
12. Start your 14-day Agent trial
13. Watchdog Score by property
14. Chapter 123 ratio by town
15. Built for New Jersey only

Descriptions (4):
1. Compare municipal tax and assessment context for two NJ towns, with the source year.
2. Effective tax rate, assessment ratio, revaluation status. No town is called good or bad.
3. Free to view. Agent plan: save it, attach it to a report, monitor the towns you work.
4. Assessments are tax-administration values, not list prices. Not an appraisal.

Use `{Location(City)}` insertion in headline 1 only where the town keyword matches a real municipality name; otherwise the static headline.

Sitelinks: Town Compare (`/town-compare`), Data methodology (`/data-methodology`), Agent field guide (`/real-estate-agents`), Agent trial (`/agents/trial`).
Callouts: Free to view, Source year shown, 564 municipalities, For NJ agents.
Structured snippet, header "Types": Effective tax rate, Assessment ratio, Revaluation status, Chapter 123 ratio, Tax rate history.

Final URL: `https://www.watchdogindex.com/town-compare`.

### TP (AD-G-TP), active Dec 1 to Dec 11 only

"Triple play" is also a cable and phone bundle and a baseball term, so the negative list is long and the match types are tight.

Keywords:

[triple play realtor convention 2026], "triple play realtor convention", "triple play realtors convention", "triple play convention 2026", "triple play atlantic city 2026", "triple play convention atlantic city", "triple play real estate convention", "triple play convention schedule", "triple play convention exhibitors", "triple play convention registration", "triple play convention hotels", "triple play convention parking", "triple play trade expo", "triple play realtor expo", "njar triple play", "nj realtors triple play", "triple play 2026 speakers", "triple play convention ce credits", "triple play convention december 2026", "triple play convention app", "triple play convention map", "atlantic city realtor convention", "realtor convention atlantic city december", "nj realtors convention 2026", "new jersey realtors convention", "pa realtors convention atlantic city", "ny realtors convention atlantic city"

Negatives: "cable", "internet", "verizon", "fios", "comcast", "xfinity", "optimum", "spectrum", "bundle", "tv", "phone plan", "baseball", "mlb", "sports", "bowling", "lottery", "slot", "casino promo", "concert", "tickets"

Headlines (15):
1. Watchdog at Triple Play 2026
2. Dec 7 to 10, Atlantic City
3. Find John on the floor
4. Bring an address, see it live
5. NJ property intelligence
6. Start your 14-day Agent trial
7. For agents working in NJ
8. Booth [number]
9. Agent plan, $59 per month
10. Five minutes, no pitch
11. Source on every number
12. The Watchdog Score, live
13. Postcards at $1.79 per card
14. Founder: John Scafide
15. Meet Watchdog in person

Descriptions (4):
1. At Triple Play Dec 7 to 10. Bring a listing address and see the property story live.
2. New Jersey property intelligence for agents: assessment, taxes, permits, verified sales.
3. Find John at [booth or meeting spot]. Five minutes, no pitch, and you leave knowing more.
4. Can't make it? Start your 14-day Agent trial. Card required, $59 per month after day 14.

Sitelinks: Agent trial (`/agents/trial`), Agent field guide (`/real-estate-agents`), Plans (`/pro`), Town Compare (`/town-compare`).
Callouts: Dec 7 to 10, Atlantic City, Bring an address, NJ only.
Structured snippet, header "Features": Property Lookup, Watchdog Score, Opportunity Desk, Postcard Studio.

Final URL: `https://www.watchdogindex.com/agents/trial`. Booth placeholder must be filled before the group is enabled on Dec 1.

## 4. Bidding strategy by phase

Honest note: at Lean and Recommended budgets, this campaign will not reach 30 conversions in 30 days, which is where Google's automated conversion bidding starts to work. Do not switch to Target CPA early; it will spend the budget on the cheapest clicks it can find, which are homeowners.

| Phase | Strategy | Settings |
| --- | --- | --- |
| 0 (Oct 5 to 11) | Manual CPC, enhanced CPC off | Max CPC $4 BRAND, $6 INTENT. Goal is search-term data, not conversions. |
| 1 (Oct 12 to Nov 1) | Maximize clicks with a max CPC bid limit | Limit $7 (Lean), $8 (Recommended), $9 (Aggressive). COMP group limit $9 on all tiers. |
| 2 (Nov 2 to Dec 6) | Same, unless 30 or more `trial_started` in the prior 30 days from Search alone; then Maximize conversions, no target, for two weeks before adding a Target CPA at 1.2 times observed cost per trial | Aggressive tier is the only one likely to qualify. |
| 3 (Dec 7 to 31) | Hold whatever Phase 2 ended on. No strategy changes after Dec 14. | Google's learning period would eat the last two weeks. |

Ad rotation: optimize. Ad strength target: Good or better on every RSA. Keep at least 12 unpinned headlines.

## 5. Location settings

- Target: New Jersey (state). Location option "Presence: people in or regularly in your targeted locations." Not "Presence or interest."
- Exclude: nothing at launch. If search terms show out-of-state agents from the NYC or Philadelphia metro searching NJ terms, leave them; they may work NJ. Add exclusions only for clear non-NJ intent (for example, "chapter 123" is also a Pennsylvania term in other contexts; watch it).
- Retargeting buffer: the 10-mile Philadelphia and NYC suburb buffer applies only to the observation-mode remarketing list (RLSA) on this campaign, with a plus 20 percent bid adjustment for list members. Prospecting stays NJ only.
- Language: English.
- Devices: all, with a minus 20 percent bid adjustment on mobile for the TOWN group only (homeowner-heavy on mobile).

## 6. Ad schedule

- Monday to Friday 06:00 to 22:00, all groups. Monday 06:00 to 12:00 plus 15 percent (the Monday desk hook).
- Saturday 08:00 to 18:00, Sunday 08:00 to 20:00, minus 15 percent.
- Off 22:00 to 06:00 every day. Agents searching at 2 a.m. are rare; homeowners paying a bill are not.
- Triple Play group: Dec 1 to 11, 06:00 to 23:00, no day-part adjustment.
- Dec 24 to 27: BRAND only, no schedule adjustment.

## 7. Weekly search-terms review checklist (every Tuesday 09:00, part of the paid review)

1. Export search terms for the last 7 days, all ad groups, sorted by cost.
2. Flag every term that is homeowner intent: paying, ANCHOR, Senior Freeze, PAS-1, deductions, exemptions, appeal my own taxes, tax sale, lien. Add each as a phrase negative at campaign level.
3. Flag every term that is job, school, exam, or license intent. Add as negatives.
4. Flag competitor terms with login, cancel, support, refund intent. Add as negatives.
5. Flag "triple play" telecom and sports terms. Add as negatives (all weeks, not just December, because the TP negatives protect other groups too).
6. Find terms with 2 or more conversions that are not yet keywords. Add them as phrase match to the right group.
7. Check each ad group's cost per `trial_started` against the kill rules in `paid-media-strategy.md`, section 7. Pause keywords above $9 CPC with zero trials after $300.
8. Check the TOWN group's agent share (conversions divided by clicks, and a scan of the terms). Cut to the five "compare" terms if under 30 percent after $150.
9. Check ad strength and any disapprovals. Fix disapprovals the same day; never resubmit with housing language.
10. Confirm final URLs still resolve to clean root-level pages (no `/property/` in any final URL) and that the tracking template is intact.
11. Record decisions in the weekly report (`utm-and-tracking.md`, section 9).
12. Update `budget-and-pacing.csv` if any budget moved.
