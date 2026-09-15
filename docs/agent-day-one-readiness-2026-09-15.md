# Watchdog Agent launch review

**Review date:** September 15, 2026

**Production:** https://www.watchdogindex.com

**Source baseline:** `johnscafide/njtaxrelief` at `b3afdee633ef878297dc2d1724b5ab5ffc70d2f3`

**Verdict:** Substantial product built; **Agent launch is blocked**. A numerical readiness percentage would imply more verified coverage than the evidence supports.

## What matters most

A paying Agent could be denied access to the Opportunity Desk and farming pages. The page gates still required Pro, and 17 production database policies across five Agent workflow tables also required Pro. A Developer-account walkthrough would miss these defects.

This review prepared fixes for those boundaries, repeated refresh loops, saved-action behavior, first-use guidance, modal keyboard use, missing-value presentation and the sign-in handoff. Local authorization and browser interaction tests pass. **These changes are prepared for review; production has not been changed.**

The configured staging project `pxossnwmrygxlpxtstnl` returns a DNS “name does not exist” error and is absent from the connected Supabase project list. This prevents an honest claim that a real Agent can complete the authenticated workflows in the release candidate. The repository explicitly requires staging for authenticated automation.

## Start with the agent's first useful result

The opening experience should answer **“What do I need to do today?”** A new agent should choose among three useful jobs, with a single primary action for each.

| Initial job | Complete workflow | What good looks like |
|---|---|---|
| Prepare for a listing appointment | Search a known address → confirm parcel → review relevant evidence → save → prepare a client brief | Address and source dates stay visible. The first screen explains the three most useful findings. Facts, estimates and suggestions are distinct. |
| Answer a buyer's question | Open two properties → compare annual tax and assessment context → inspect differing years → share explanation | An agent can explain carrying-cost differences on a phone without horizontal scrolling or confusing tax, assessment and market value. |
| Start serving an existing sphere | Import/select known properties → preview matches and unresolved addresses → review a sourced reason → copy a useful conversation starter → log follow-up | Import errors are recoverable. Contact references survive. Repeat imports do not create duplicates. Private notes do not leak into client output. |
| Establish a public lead path | Complete professional profile → understand verification state → preview portal → open QR on phone → submit test inquiry → see it attributed to the agent | Correct brokerage identity, consent, confirmation and one lead record. A pending-verification agent still has useful work to do. |

The new Opportunity Desk guide connects property research, sphere import and neighborhood farming. It also explains how Watchdog complements the MLS. This improves the first-use entry point; it does not replace full onboarding and verification acceptance.

## Daily use and farming

| Agent question | Required completed loop | Acceptance still needed |
|---|---|---|
| What needs my attention today? | New changes + due follow-ups → evidence → action → recorded outcome | Actual Agent data loading, useful ranking and saved outcomes across sessions |
| What changed in my farm? | Choose town or draw area → understandable filters → preview count → named farm → reopen criteria | Real save/reopen, scan/resume and plan-cap behavior |
| Why should I contact this client? | Finding → source/date → plain explanation → conversation starter → follow-up | Relevant changed-property cases, rather than only zero-change monitoring |
| Can I work this on the road? | Search/nearby map → field property card → quick watch/note → desktop continuation | Phone geolocation-denied fallback, map loading, touch targets, mobile browser coverage |
| Can I take this into my existing workflow? | Selected records → export/brief → successful handoff → visible result count | Agent-eligible CSV/report/export and CRM import compatibility |
| Can I send a neighborhood update? | Saved farm → summary → reviewed creative → recipient proof → approved fulfillment → status | Export and creative acceptance; live direct-mail certification remains unproven |

Useful reasons to return include assessment and tax changes, municipal revaluation notices, permits, verified recorded transfers, local sale context and property-service deadlines. These support factual client service. They should not be presented as proof that a homeowner intends to sell.

## Why use Watchdog alongside MLS and portals?

**The defensible proposition is a shorter path from a property question to sourced NJ context, a client explanation and a recorded next action.** That is a product hypothesis to validate with working agents, not a proven competitive advantage.

| Alternative | Already available from official product material | Watchdog's specific companion job |
|---|---|---|
| Zillow Premier Agent | Inbox, contacts, client activity, tasks, follow-up recommendations and property context | Supply the substance of a useful property-specific conversation with an existing client. [Official overview](https://www.zillow.com/pro/app-overview/) |
| Realtor.com | Buyer/seller lead products and marketing; Listing Toolkit includes enhanced Cloud CMA presentations in select markets | Add the NJ tax/assessment explanation and evidence behind a listing discussion. [Listing Toolkit](https://www.realtor.com/marketing/listingtoolkit/) |
| Homes.com | Agent branding, listing exposure and presentations, retargeting, lead vetting, reports and sphere marketing | Provide ongoing property-service reasons to reconnect, including after closing. [Agent products](https://www.homes.com/advertise/agents/) |
| NJMLS | Remine PRO is advertised as included at no charge: active/off-market search, equity/tenure, property tracking, CMAs, contacts and map layers | Win on speed, clarity and continuity from NJ finding → explanation → follow-up. Maps, farms and alerts alone are not differentiation. [NJMLS Remine PRO](https://www.newjerseymls.com/services/remine-pro/) |
| Bright MLS | Mobile saved searches, carts, contacts, favorites and property/market insights through MLS-Touch | Add a usable field explanation and preserve research/follow-up work across devices. [Official guide](https://assets.ctfassets.net/1g8q1frp41ix/4A6Fu7BbN7Lqa8SoDGwaRB/c602fea175354f81d82d0b0f9a737951/BrightMLS_User_Guide_for_MLS-Touch__Interactive_Guide_.pdf) |
| GSMLS | Official material documents CMA creation and reports; exact current member packaging was not independently verified | Pair MLS pricing/listing operations with Watchdog's property context; do not claim GSMLS lacks research tools. [GSMLS CMA material](https://img.gsmls.com/common/archive72.html) |

Concrete MLS companion examples:

1. **Listing appointment:** Use MLS for the pricing CMA and listing history. Use Watchdog for the parcel's tax position, assessment changes and questions to investigate before the appointment.
2. **Buyer consultation:** Use MLS to identify inventory and arrange showings. Use Watchdog to explain why two homes with similar prices have different tax carrying costs.
3. **Weekly farming:** Use MLS for relevant listing activity. Use Watchdog to turn verified property changes in a saved farm into useful conversations and track what happened afterward.
4. **Post-closing service:** Keep the property watched for tax/assessment changes and service deadlines, creating an ongoing reason to help the client.

## Confirmed defects and prepared fixes

| Priority | Finding | Prepared remedy and evidence |
|---|---|---|
| P0 | Agent is excluded from six core pages: Desk, Farm Builder, Farm Map, Market List, Growth and Report Studio | Align page requirements to Agent; 64 executions of the real access guard test allowed and denied roles/statuses |
| P0 | Production policies require Pro for farm properties, opportunities, territories, digest preferences and funnel events | 17 narrowly scoped `ALTER POLICY` statements retain ownership and paid-plan checks; isolated PostgreSQL reproduced the old denial and passed 71 checks after the change |
| P1 | Monitoring panels rewrite themselves under a mutation observer | Make unchanged rendering idempotent and coalesce refreshes; isolated browser test verifies idle stability |
| P1 | Capacity UI continually triggers new RPC requests from its own DOM changes | Refresh after completed workspace changes; verify counts settle after list creation |
| P1 | Quick-watch does not place the property in Watching | Use persisted action state for queue membership, counts and badges |
| P1 | Failed writes leave misleading or stuck UI | Restore retryable action, digest and monitoring states; do not inflate analytics when saving an outcome fails |
| P1 | New agent receives little practical guidance | Add research → import → farm entry guidance and an MLS companion explanation |
| P1 | Signed-out protected-page visit loses its destination at the Dashboard | Send through shared safe onboarding with the original return path; VM test and phone/desktop browser preview pass |
| P2 | Import/evidence keyboard behavior only runs at mobile widths | Apply Escape and focus restoration at desktop widths too |
| P2 | Missing property amounts can render as zero | Preserve unknown values instead of displaying `$0` |
| P2 | Farm Builder has a duplicate input/section ID | Give the financial-filter section its own ID and update its anchor |
| P2 | Existing entitlement test contradicts the intentionally public Data Center catalog | Test the public catalog plus the retained Pro+ private-execution boundary |

These are source/patch findings, not claims that all production behavior is now repaired. The database migration and frontend need coordinated release and real Agent acceptance.

## Agent plan boundaries that must be clear

Direct production RPC evidence confirms **250 farm properties, 10 lists, five territories, 250 rows per request, 2,000 scan candidates and weekly monitoring** for Agent.

The Report Builder currently allows Agent only the homeowner tax-position one-pager. Broker listing briefs and seller net sheets require **Pro or higher**. Native BoldTrail/kvCORE is documented as Teams-gated; Zapier/API automation is documented for Pro+ and Teams. The UI must disclose these boundaries before an agent invests work in an unavailable action.

**Product recommendation:** a listing brief and seller net sheet are ordinary agent jobs. Decide whether they belong in the Agent launch scope or should remain clearly labeled upgrades. This patch does not silently change those commercial entitlements.

Latest recorded Linear evidence leaves live direct-mail sending gated pending provider certification. Do not promise fulfilled mail merely because farm selection and creative preparation exist. These limits should be explicit on the final review/launch screen.

## What was verified

- Read current GitHub source, workflows and relevant Linear issues.
- Read live Supabase policy metadata, release-gate status, Agent limits and monitoring cadence; no customer records or production configuration were changed.
- Opened eight production routes at 390px and 1440px in Chrome. Agent landing, professional-agent page, Pro pricing and Support returned HTTP 200 without observed horizontal overflow or page JavaScript errors at those sizes.
- Observed signed-out Dashboard and protected-tool redirects to the homepage. The resulting homepage had horizontal overflow. This is not an authenticated workspace result.
- Verified the sign-in repair with the candidate `wd-core.js` substituted in an otherwise public browser visit: both sizes reached `/onboarding/?next=%2Fagent-desk` without signing in.
- Passed 64 local route-authorization cases, 71 isolated PostgreSQL policy checks, shared access-boundary checks, existing Agent/control-plane contracts and the isolated Agent interaction browser suite.
- Added actual Agent staging entry/interaction acceptance that rejects Developer accounts, missing credentials and production Supabase. Startup correctly fails closed without staging credentials.

**Not verified:** real Agent purchase/session lifecycle, full authenticated responsive certification, production application of the migration, real property→PDF→secure-share, portal→QR→consented inquiry attribution, changed-list email delivery, persistent cross-session farms, paid fulfillment or actual-agent comparative usability.

The fixture screenshots use explicit test data and block external requests. The sign-in preview substitutes one candidate script. Neither is a production Agent-account certification.

## Path to 100% of a defined Agent launch scope

| Gate | Current state | Completion criterion |
|---|---|---|
| Core Agent authorization | Confirmed defect; patch tested locally | Apply candidate migration to staging, test actual Agent and non-Agent isolation, release pages and migration together |
| Staging environment | Blocked | Restore/replace staging project; configure dedicated Agent credentials in environment secrets; retain production exclusion |
| Purchase and first session | Acceptance outstanding | Signed-out Agent choice → sign-in → selected-plan checkout → correct entitlement → useful workspace, including failure/return paths |
| New-agent activation | Guidance improved | New and pending-verification agents complete a useful first property workflow unaided |
| Research and client output | Feature code present; end-to-end proof outstanding | Real Agent saves property and produces a readable eligible branded PDF and secure share without private-note leakage |
| Farming persistence | Feature code present; current Agent blocked | Create/preview/save/reopen/resume a farm; criteria, counts and selected records remain correct |
| Daily actions | Local interaction fixes pass | Actual Agent watches, snoozes, dismisses and records outcomes that persist across sessions |
| Monitoring | Weekly Agent capacity confirmed | A real staged property change creates the expected notification and exact-change deep link; pause/retry works |
| Portal and verification | Happy-path proof outstanding | Complete verification, publish allowed branding, scan QR, capture test consent and verify correct agent attribution |
| Mobile/browser quality | Public Chrome checks + isolated fixtures pass | Critical authenticated jobs pass phone/tablet/desktop and mobile WebKit; keyboard, error, loading and empty states remain usable |
| Promise/plan fit | Several intentional tier boundaries | Every advertised Agent action is included and verified or clearly identified as an upgrade/unavailable capability |
| Agent pilot | Not performed | Several active NJ agents complete appointment, sphere and farm jobs alongside their current MLS and confirm a reason to return |

## Existing Linear work to reconcile

- [NJW-339: staging visual acceptance blocker](https://linear.app/njwatchdog/issue/NJW-339)
- [NJW-325: purchase/sign-in flow acceptance](https://linear.app/njwatchdog/issue/NJW-325)
- [NJW-326: dashboard release and authenticated smoke](https://linear.app/njwatchdog/issue/NJW-326)
- [NJW-33: Opportunity Desk](https://linear.app/njwatchdog/issue/NJW-33), [NJW-51: list monitoring](https://linear.app/njwatchdog/issue/NJW-51), [NJW-56: mobile field workflow](https://linear.app/njwatchdog/issue/NJW-56)
- [NJW-61: portals/QR](https://linear.app/njwatchdog/issue/NJW-61), [NJW-62: reports](https://linear.app/njwatchdog/issue/NJW-62), [NJW-63: professional verification](https://linear.app/njwatchdog/issue/NJW-63)
- [NJW-77: tool discovery](https://linear.app/njwatchdog/issue/NJW-77) — a searchable tool inventory is not full role-specific activation
- [NJW-238: direct-mail provider certification](https://linear.app/njwatchdog/issue/NJW-238), [NJW-243: farm-to-creative-to-mail](https://linear.app/njwatchdog/issue/NJW-243)

“Done” issues above are context and implementation evidence. They should not be reopened solely because of their titles; the new readiness work should track the reproduced regressions and missing acceptance explicitly.
