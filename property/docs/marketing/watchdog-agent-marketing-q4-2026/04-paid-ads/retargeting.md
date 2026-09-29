# Retargeting: Watchdog Agent plan, Q4 2026

Follows `00-brief/product-and-brand-brief.md` and `paid-media-strategy.md`. Retargeting is where the $59 math closes. Prospecting introduces the product; the sequence below brings people back with proof first, the offer second, and the founder plus year-end last. Budget: Lean $700, Recommended $1,140, Aggressive $2,020, split roughly 75 percent Meta and 25 percent Google (YouTube in-stream and Display, remarketing lists on Search).

Campaign names: Meta `Q4-RT` with ad sets per stage (`Q4-RT-D0-3`, `Q4-RT-D4-10`, `Q4-RT-D11-30`) and one for checkout abandoners (`Q4-RT-CO`). Google `Q4-RT-YT` and `Q4-RT-DISPLAY`. UTM medium `retargeting`, source `meta` or `google`.

## 1. Pools

Build pools from agent pages only. The Watchdog site also carries homeowner content (ANCHOR, PAS-1, Senior Freeze, appeal guides). Homeowners must not enter the agent retargeting pools, so every URL rule is an allowlist, not "all visitors."

| Pool | Definition | Window | Source |
| --- | --- | --- | --- |
| RT-SITE-30 | Visited any of: `/for/real-estate-agents`, `/real-estate-agents`, `/agents/trial`, `/pro`, `/pricing/*`, `/agent-desk`, `/agent/*`, `/town-compare`, `/free`, `/beta`, `/data-methodology` | 30 days | Meta pixel, GA4 audience, LinkedIn Insight Tag |
| RT-LP-NC | Fired `view_landing` on `/agents/trial` and did not fire `trial_started` or `founding_invite_requested` | 30 days | Meta pixel and CAPI, GA4 |
| RT-CO-AB | Fired `checkout_started` and did not fire `trial_started` within 24 hours | 14 days | Meta pixel and CAPI, GA4 |
| RT-VID-50 | Watched 50 percent or more of any Watchdog video ad or organic video (Meta), or any YouTube ad or channel video | 60 days | Meta engagement audience, YouTube linked audience |
| RT-ENG | Engaged with the Facebook page or Instagram profile: reactions, comments, saves, shares, profile visits, ad clicks | 90 days | Meta engagement audience |
| RT-LIST | Launch list emails and Founding invite requests, hashed and uploaded | Refreshed every Monday | Customer list upload (Meta, Google Customer Match if the account qualifies, LinkedIn matched audience) |
| RT-TP | Triple Play radius audience from Dec 5 to 11 | 30 days after Dec 11 | Meta location audience |

Minimum sizes: Meta needs about 1,000 people in a pool for delivery to be stable; below that, merge RT-SITE-30 and RT-ENG into one ad set. Google Display needs 100 active members in 30 days; YouTube needs 1,000.

## 2. Sequence by day since visit

Stage membership is by most recent qualifying visit. Each stage excludes the later stages' converters and the earlier stage's audience so a person sees one stage at a time.

| Stage | Days since visit | Creative and message | Variants | Frequency cap |
| --- | --- | --- | --- | --- |
| 1 Proof | 0 to 3 | Sample property card, Opportunity Desk card, approved quote. Show the useful fact again. | AD-R-001 to AD-R-004 with CR-01, CR-03, CR-10 | 4 impressions per 3 days |
| 2 Offer | 4 to 10 | Trial disclosure card, Founding invite, postcards. Ask for the one action. | AD-R-005 to AD-R-008 with CR-07, CR-06, CR-04 | 3 per 7 days |
| 3 Founder and year end | 11 to 30 | Founder video (SV series), founder note card, year-end annual from Dec 14. | AD-R-009 to AD-R-012 with SV founder video, CR-12, CR-08 | 2 per 7 days |
| Checkout abandoners | 0 to 14 (parallel, overrides stages) | One message: the disclosure block and the one-click cancel. | AD-R-006 with CR-07 | 2 per day for 3 days, then 3 per 7 days |

Google: mirror stages 1 and 2 on YouTube in-stream (AD-Y-001 then AD-Y-004) and Display (CR-01 then CR-07 in 300x250, 728x90, 320x50, 1200x628 responsive). Remarketing list on Search (RLSA) in observation mode with a plus 20 percent bid adjustment and the 10-mile Philadelphia and NYC suburb buffer allowed on this list only.

## 3. Frequency caps and fatigue

- Caps above are per person per stage. Total exposure across the 30-day sequence is about 12 impressions, which is the upper end of reasonable for a $59 product.
- Refresh creative when frequency passes 6 in 7 days in any ad set, or when link CTR drops below half its first-week level.
- Pause the whole RT campaign for a person once they convert (see exclusions).
- Quiet week Dec 24 to 27: stage 3 only, cap 1 per 7 days.

## 4. Exclusions (applied to every retargeting ad set)

- Anyone who fired `trial_started` in the last 180 days.
- Anyone who fired `subscription_confirmed` in the last 365 days.
- Current customers list (hashed, refreshed weekly from Supabase).
- Employees and contractors.
- For invite ads (AD-R-007): anyone who fired `founding_invite_requested`.
- For the year-end annual ads (AD-R-011, AD-R-012): anyone already on an annual plan.
- Homeowner content visitors who never touched an agent page (enforced by the allowlist above, and by excluding visitors of `/anchor-program`, `/pas-1-guide`, `/veterans`, `/anchor-estimator`, and similar homeowner routes as a belt-and-braces rule).

## 5. Copy variants

Short copy only. Primary text under 125 characters, headline under 40, description under 30. UTMs: `?utm_source=meta&utm_medium=retargeting&utm_campaign=q4-agents-<phase>&utm_content=ad-r-0NN` (use `utm_source=google` for the Google versions). Destination is `/agents/trial` unless noted.

### Stage 1, proof (day 0 to 3)

#### AD-R-001
- Primary: 123 Example Street. Assessment up 11.4% since 2024, source dated. That card is waiting on any NJ address. Sample.
- Headline: The property story, already there
- Description: Source on every number
- Creative: CR-01
- CTA: Learn more

#### AD-R-002
- Primary: Monday: three past clients have a property reason to hear from you. Reason, source date, next action. Sample shown.
- Headline: A real reason to reach out
- Description: Opportunity Desk, weekly
- Creative: CR-03
- CTA: Learn more

#### AD-R-003
- Primary: "The property story is already there when I need it." NJ real estate agent. See what they mean on one address.
- Headline: Know the property before you walk in
- Description: New Jersey only
- Creative: CR-01 with approved quote overlay
- CTA: Learn more

#### AD-R-004
- Primary: Watchdog Score 72 of 100, six pieces of evidence beside it, source and date on each. Sample property.
- Headline: The Watchdog Score, explained
- Description: Evidence beside the number
- Creative: CR-10
- CTA: Learn more

### Stage 2, offer (day 4 to 10)

#### AD-R-005
- Primary: Start your 14-day Agent trial. Card required, $59 per month after day 14 unless cancelled. Cancel in one click.
- Headline: Start your 14-day Agent trial
- Description: $59 per month after day 14
- Creative: CR-07
- CTA: Sign up

#### AD-R-006 (checkout abandoners, and stage 2)
- Primary: You stopped at checkout. Fair. Reminder 3 days before the first charge, one-click cancel, refund on request within 7 days.
- Headline: Cancel before day 14, pay nothing
- Description: Reminder 3 days before
- Creative: CR-07
- CTA: Sign up

#### AD-R-007
- Primary: 100 Founding Agent seats for New Jersey. Invite code, direct line to the founder, same $59 plan. Request an invite.
- Headline: Request a Founding Agent invite
- Description: 100 seats, New Jersey only
- Creative: CR-06
- CTA: Apply now

#### AD-R-008
- Primary: Farm postcards at $1.79 per card, printing and postage in. Draw the farm, proof the card, mail it inside the trial.
- Headline: Farm postcards, $1.79 per card
- Description: Minimum 50 addresses
- Creative: CR-04
- CTA: Sign up

### Stage 3, founder and year end (day 11 to 30)

#### AD-R-009
- Primary: Two minutes from John on why Watchdog exists and what it does not do. Then decide.
- Headline: Two minutes on why I built this
- Description: From John Scafide
- Creative: SV founder video [confirm SV ID in 03-social], fallback CR-12
- CTA: Watch more

#### AD-R-010
- Primary: Still thinking about it? The trial is 14 days, the cancel is one click, and the reminder comes 3 days before any charge.
- Headline: Still deciding? Fair enough.
- Description: Start your 14-day Agent trial
- Creative: CR-12
- CTA: Sign up

#### AD-R-011 (from Dec 14)
- Primary: Annual is $590, ten monthly payments for twelve months. Pay before Dec 31 and it is a 2026 expense. Ask your accountant.
- Headline: $590 a year. Expense it in 2026.
- Description: Ten payments, twelve months
- Creative: CR-08
- CTA: Get offer
- Destination: `/pro`

#### AD-R-012 (from Dec 14)
- Primary: 2027 assessment notices land around Feb 1. Add your past clients now so you have the answer when they call.
- Headline: Get ready for 2027 appeal season
- Description: Start your 14-day Agent trial
- Creative: CR-10
- CTA: Sign up

## 6. Weekly checks

- Pool sizes and overlap (Meta audience overlap tool) every Tuesday; merge pools under 1,000.
- Frequency by ad set; refresh at 6 in 7 days.
- Cost per `trial_started` from retargeting should be under the prospecting figure; if it is above 1.5 times, something is wrong with the pool definition (probably homeowners), so audit the URL rules.
- Confirm exclusions are attached to every ad set after any edit; Meta drops them silently when an ad set is duplicated.
