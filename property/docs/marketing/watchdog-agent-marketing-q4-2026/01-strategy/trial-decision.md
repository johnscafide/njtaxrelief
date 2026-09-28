# Trial decision: should the front door be a 7-day trial with a card that auto-renews monthly?

Short answer: card required, yes. Seven days, no. Auto-renew at $59 per month, yes, with a reminder and a one-click cancel that we advertise as a feature. Run the Founding Agent cohort on invite codes with no card beside it.

Recommended front door: **14-day Agent trial, card required, converts to $59 per month on day 14 unless cancelled.** Reminder email and text on day 11. Cancel in one click from Account. Refund the first charge if asked within 7 days.

## Why card required

1. **It produces more paying agents per visitor, not fewer.** Published SaaS benchmarks put card-required trials at roughly 35 to 55 percent trial-to-paid (median around 44 percent) versus 8 to 22 percent for no-card trials. Per 1,000 landing page visitors the same sources show card-required trials producing fewer starts but about three times the paying customers. Treat these as external planning ranges, not promises. Sources: Userpilot, Flint, GrowthSpree, Konabayev, Baremetrics benchmark write-ups linked at the end of this file.
2. **It filters for agents who will actually use it.** Agents are known trial tourists. A card is a small commitment that separates "curious" from "I want this to work." With a small founder team, 40 serious trials teach you more than 200 idle ones.
3. **The product has a weekly rhythm.** The Opportunity Desk is a Monday queue with a weekly email. Value shows up on the second Monday, not the second day. Agents who stayed past two Mondays are the ones who convert.

## Why 14 days instead of 7

- A 7-day trial that starts on a Tuesday sees one Monday desk at best, and sometimes none. Fourteen days guarantees two.
- Postcard Studio takes days: build an audience, design, proof, mail, then wait for calls. Seven days cannot show a result.
- The Agent Academy is 8 lessons and is currently marked "required for trial accounts." That alone eats a chunk of a 7-day window. Recommendation (owner decision): make lesson 1 the day-0 action and keep the rest strongly nudged, not blocking.
- PropStream uses 7 days. Matching them is not a reason. Our product needs two Mondays; theirs does not.

## Why auto-renew is fine if you make it honest

Agents have been burned by tools that quietly billed them. The way to beat that is not to remove auto-renew; it is to make the reminder and cancel the most visible thing on the page. Say this, in these words, on the landing page, at checkout, and in the day-0 email:

> Your card is charged $59 on day 14 unless you cancel. We remind you by email and text three days before. Cancel in one click from your Account page. If we charge you and you did not mean it, tell us within 7 days and we refund it.

That promise costs almost nothing and removes the number one reason an agent will not enter a card.

Legal note (not legal advice): New Jersey has automatic-renewal disclosure requirements and the FTC has pursued negative-option billing cases. Many agents buy as sole proprietors, so treat them like consumers: clear and conspicuous disclosure before the card is entered, an easy online cancel, and a confirmation email that repeats the terms. Counsel review is already listed as pending in the launch-control file; add the trial terms to that review.

## Decision matrix

| Option | Trial starts | Paid conversions | What you learn | Support load | Legal risk | Engineering | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 7-day, card, auto-renew (as asked) | Medium | Medium | Low (too short to see the weekly loop) | Medium (refund requests from people who never saw a Monday desk) | Medium | Small change to existing code | Not recommended |
| **14-day, card, auto-renew, reminder + one-click cancel** | Medium | **High** | Good | Low | Low with disclosure | Small change to existing code | **Recommended** |
| 14-day, no card | High | Low | Good volume, weak signal | High (nurture everyone) | Low | Already built (7-day version) | Use only for Founding invites |
| Reverse trial (full Agent free for 14 days, then drop to Free) | High | Low to medium | Good | Medium | Low | Needs entitlement work | Later, not Q4 |
| Freemium only, no trial | High | Low | Weak | Low | Low | None | Already exists as the Free plan; keep it as the no-card door |

## The two doors

Run both at once. They serve different people.

| Door | Who | Card | Length | Converts to | Cap |
| --- | --- | --- | --- | --- | --- |
| Start your 14-day Agent trial | Anyone from ads, search, social | Yes | 14 days | $59 per month (or switch to $590 per year) | None |
| Request a Founding Agent invite | Referrals, lunch-and-learn attendees, warm agents John talks to | No | 30 days (existing invite-code beta) | Asked for a card on day 26 to continue | 100 seats |

If the billing gate is not open on October 12, Phase 1 runs on the Founding door only. That path is already built and is limited to 100 redemptions, which is the cohort size anyway.

## What to change in the product (engineering list)

The checkout function already contains a controlled Agent trial. Today it is 7 days, monthly cadence, card optional, and the subscription cancels at the end if no card was added. The change set:

1. In `supabase/functions/create-checkout-session/index.ts`: change the controlled Agent trial from 7 days to 14 days, and collect a payment method always (Stripe `payment_method_collection: 'always'`). Keep the one-trial-per-account check that already exists. Keep the offer gated by the billing release gate; do not weaken the gate.
2. Add Stripe Checkout custom text that states the trial terms in the plain words above, so the disclosure sits where the card is entered.
3. Handle Stripe's `customer.subscription.trial_will_end` event (sent 3 days before the trial ends) in the webhook and trigger the day-11 email and SMS.
4. Configure the Stripe Customer Portal to allow immediate cancellation during trial. Put a "Cancel trial" button on the Account page that opens the portal in one click.
5. Add an SMS consent checkbox at signup (separate from email), stored with timestamp. No consent, no text.
6. Update the plans page FAQ "Is there a free trial? Not yet." to the 14-day terms once live.
7. Build `/agents/trial` (spec in 04-paid-ads/landing-page-specs.md) and the thank-you page.
8. Refund on the first charge within 7 days: a support runbook line, not code. Log it in the existing billing support runbook.

Estimated effort: two to four engineering days including QA on Stripe test mode. Do not run real charges to test; use Stripe test mode and the existing acceptance runbook.

## What to measure in the first 14 days after opening

- Landing page to trial start rate (target 3 to 6 percent with card).
- Day-0 activation: Academy lesson 1 done, 5 past clients added, one farm drawn (target 60 percent of trials do at least two of the three within 48 hours).
- Second-Monday retention: percent of trials who open the Opportunity Desk in week 2 (target 50 percent).
- Trial to paid (target 35 percent by the end of October, 45 percent by December).
- Refund requests on first charge (target under 5 percent of conversions; above 10 percent means the reminder is not visible enough).

## Fallback rules

- If trial starts are under 1.5 percent of landing views after 500 views, the page is the problem, not the card. Fix the page before touching the trial terms.
- If trial-to-paid is under 25 percent after 40 trials, look at day-0 activation first. Agents who never added clients cannot see a Monday desk.
- If refund requests exceed 10 percent, move the reminder to day 10 and add an in-app banner from day 11.

## Sources for the benchmark ranges

- https://userpilot.com/blog/saas-average-conversion-rate/
- https://www.flint.com/articles/b2b-saas-free-trial-conversion-rate-statistics
- https://www.growthspreeofficial.com/blogs/b2b-saas-trial-to-paid-conversion-rate-benchmarks-2026-by-trial-type-acv-length-credit-card
- https://konabayev.com/blog/free-trial-conversion-2026/
- https://baremetrics.com/blog/trial-conversion-rate-metrics-explained
