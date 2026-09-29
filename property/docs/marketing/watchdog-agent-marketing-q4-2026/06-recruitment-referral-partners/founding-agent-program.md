# Founding Agents program

Folder: 06-recruitment-referral-partners. Owner: John. Coordinator runs the queue. Built in Phase 0, filled in Phase 1, kept warm in Phases 2 and 3.

Read 00-brief/product-and-brand-brief.md first. Every price, date, and URL below comes from it.

## What this is

One hundred seats for New Jersey agents who will use Watchdog every week this fall and tell us what is wrong with it. They get a locked price and a few things nobody after them gets. We get a cohort that actually uses the product, honest feedback, and the first agent stories.

Applications open Monday October 5. Invites go out from Monday October 12, twenty per week. The program works whether or not public checkout is open on October 12 (see "Two billing states").

The invite mechanics already exist in the product: invite codes at /beta give a 30-day or 60-day Agent trial with no card, a code can carry up to 100 redemptions, and a code can be locked to one recipient email. No engineering is required to run the core program.

## What a Founding Agent gets

| Benefit | What it actually is | Status |
| --- | --- | --- |
| Price locked at $59 per month or $590 per year for as long as they stay subscribed | A Stripe coupon or locked price on the account at the moment they convert to paid. It only matters if the Agent price ever rises. Say that plainly; do not sell it as a discount. | Owner decision. John creates the coupon in Stripe. No engineering. |
| 25 postcards on us | $44.75 of mail credit ($1.79 per card on Agent). Postcard Studio needs 50 mailable addresses per run, so this covers half of a first 50-card mailing. Cards that cannot be mailed come back as mail credit anyway. | Owner decision. Confirm with engineering that a manual mail-credit grant is possible today; if it is not, this needs engineering. |
| Founding Agent badge on the verified share page (/agent/you) | A small "Founding Agent, 2026" mark on the public share page and on shareable property pages the agent sends out. | Needs engineering. |
| Direct line to John | A private group chat for the cohort. John answers there first. | No engineering. Owner decision on the tool: [WhatsApp, Signal, or Slack]. |
| Monthly roadmap call | 45 minutes on Zoom. John shows what shipped, what is next, and takes votes. First call Thursday November 12 (it doubles as the Founding Agents roundtable). Second call Thursday December 17. | No engineering. |
| First access to the Watchdog Intelligence add-on | Founding Agents get the add-on turned on before the general Agent population when it opens. Add-on pricing is not set in this plan and is not quoted anywhere. | Owner decision. Needs engineering if access is flag-gated per account. |
| Name on a Founding Agents page | Opt-in. Name, brokerage, town, and an optional link to their /agent/you page. | Needs engineering (a light static page under the Watchdog site). |

Nothing else. Do not attach "lifetime" language to this program. The $1,499 Agent Founding Lifetime offer is a separate product that stays gated until billing opens; if a Founding Agent asks about it, point them to /pro and say when it opens.

## What a Founding Agent commits to

1. Use it weekly for 60 days. The bar is low on purpose: open the Opportunity Desk each Monday, act on at least one card, keep the client list current.
2. One 15-minute feedback call with John, booked by the Coordinator in week 3 or 4.
3. Permission for us to ask for a quote or a story. Asking is allowed. Saying yes is never required, and nothing in the program depends on it.

## Who qualifies

- Holds an active New Jersey real estate license (salesperson, broker-salesperson, or broker). The Coordinator verifies each accepted applicant against the state license lookup before the code goes out [verify the exact lookup tool and steps the Coordinator will use].
- Works a sphere or a farm. Past clients, a geographic farm, or both. A brand-new licensee with no past clients can join but sits at the back of the queue.
- Will actually use it. The application asks how, in one sentence. Vague answers wait.

Not a fit: out-of-state agents, vendors posing as agents, anyone whose stated goal is owner phone numbers or contact lists (Watchdog does not have them and does not sell them), and anyone who describes the product as a way to find people who are about to sell. Property data is not seller intent, and the cohort has to understand that from day one.

Mix goal, not a rule: spread the 100 across counties, independents and franchise offices, solo agents and team members. If 40 applications arrive from one office, take 8 and put the rest on the waitlist. That office is a lunch-and-learn (see brokerage-lunch-and-learn.md).

## How to apply

Form location: [owner decision: a form tool linked from /for/real-estate-agents and /agents/trial, or a page at /agents/founding]. Keep it to one screen.

Fields:

1. Full name
2. Work email
3. Mobile number (optional; used only for the onboarding reminder if the consent box is checked)
4. Brokerage and office town
5. NJ license type (salesperson, broker-salesperson, broker) and license reference number (or a checkbox attesting to an active NJ license, with the number collected at acceptance)
6. Years licensed
7. Counties you work (multi-select, all 21)
8. Roughly how many past clients or sphere contacts you have in NJ (ranges: under 25, 25 to 100, 100 to 300, over 300)
9. Do you farm a geographic area? (yes or no; if yes, which town or neighborhood)
10. CRM in use (free text; ask specifically about BoldTrail/kvCORE because the direct connection is in beta)
11. How you will use Watchdog in a typical week (one sentence)
12. How you heard about us (list: lunch-and-learn, another agent, TikTok, LinkedIn, email, Triple Play, other)
13. Consent checkbox: "Email me about the Founding Agents program and Watchdog for agents. Unsubscribe anytime." (required to submit)
14. Consent checkbox: "Text me the onboarding reminder at the number above." (optional)
15. Opt-in checkbox: "List my name and brokerage on the Founding Agents page." (optional; can be changed later)

## How invites are issued

Batches of 20 on Mondays: October 12, October 19, October 26, November 2, November 9. Five batches, 100 seats. Twenty a week is the most John can onboard properly while running lunch-and-learns.

Mechanics (all supported by the current product):

- One invite code per batch, labeled FOUNDING-B1 through FOUNDING-B5, 20 redemptions each, 30-day Agent trial, redeemed at /beta. If a batch code leaks outside the cohort, revoke it and reissue recipient-locked codes to the affected agents.
- The acceptance message (RF-002) carries the code, the /beta link, and two onboarding call options.
- Acceptance window: 7 days. A seat not redeemed by the following Monday goes to the next person on the waitlist.
- Onboarding calls: 30 minutes on Zoom, Tuesday 12:00 and Thursday 17:30 of batch week. Group format, up to 10 per call. John runs them; the Coordinator sends links and takes notes.
- Activation nudge (RF-008) goes out on day 5 after redemption to anyone who has not hit all four activation steps.

Two billing states:

- Public checkout is open on October 12. Founding Agents still enter on the 30-day invite code with no card. When the trial ends they start the paid Agent plan at $59 per month or $590 per year and the locked-price coupon is applied. The public front door ("Start your 14-day Agent trial") runs beside this for everyone who is not in the cohort.
- Public checkout is not open on October 12. Same invite code, same onboarding. Owner decision on Friday October 9: if the gate is unlikely to open by November 11 (day 30 for batch 1), issue 60-day codes to every batch instead of 30-day codes so no Founding Agent loses access while waiting. [Confirm with engineering the extension path for an agent whose trial ends before checkout opens; the fallback is a fresh 60-day code.]

## Waitlist handling

- Every application that is not accepted in the current batch goes on the waitlist in order received, with county and office noted so the mix can be balanced.
- Waitlist reply (RF-006) goes out within two business days of applying.
- Waitlisted agents get the weekly agent email, the October 22 and November 19 webinar invites, and first call on freed seats.
- Friday 14:00 review: the Coordinator ranks the waitlist, John approves the next 20, acceptance messages go out Monday 08:00.
- Freed seats: a seat is freed when an accepted agent does not redeem within 7 days, or redeems and shows no activation step in 14 days after two nudges. Freed seats are reassigned through Friday December 4. After that, no more Founding seats are issued this year.

## What happens at seat 100

- The application form closes the day seat 100 is redeemed. The page copy switches to: "The Founding Agents cohort is full. Start your 14-day Agent trial." if checkout is open, or "The Founding Agents cohort is full. Join the list and we will tell you when the next batch opens." if it is not.
- Never add seats. The number is the point.
- Everyone still on the waitlist gets one email that day (RF-009) with the trial door or the list, and the Triple Play dinner invite if they are within reach of Atlantic City on December 8.

## Program copy

### RF-001: Application page text

Headline: Founding Agents. One hundred seats for New Jersey agents.

Body:

Watchdog puts the public property record, the assessment and tax history, Chapter 123 context, verified sales, permits, and town context in one place, with the source and date on every number. For an agent, it is the evidence beside the MLS.

We are opening 100 Founding Agent seats to New Jersey agents who will use it every week this fall and tell us what is wrong with it.

What you get:

- Your price locked at $59 per month, or $590 per year, for as long as you stay subscribed.
- 25 postcards on us through Postcard Studio ($44.75 in mail credit).
- A Founding Agent badge on your verified share page.
- A private group chat with John and the other Founding Agents.
- A monthly roadmap call. You vote on what we build next.
- First access to the Watchdog Intelligence add-on when it opens.
- Your name on the Founding Agents page, if you want it there.

What we ask:

- Use it weekly for 60 days.
- One 15-minute feedback call.
- Let us ask you for a quote or a story. You can always say no.

Who this is for: active New Jersey licensees who work a sphere or a farm. Watchdog is not a list of people who are about to sell. It tells you which properties you already know have a real reason for a conversation this week, and shows you the source.

Invites go out Mondays starting October 12, twenty at a time, so every Founding Agent gets a live onboarding call. When the 100 seats are gone, they are gone.

Button: Request a Founding Agent invite

Footer line: Questions? Email [address] or reply to any Watchdog email.

### RF-002: Acceptance message (email; subject line: You are in. Founding Agent seat [number] of 100)

[First name],

You have a Founding Agent seat. Here is how to start.

1. Go to www.watchdogindex.com/beta and enter your invite code: [CODE]. It gives you 30 days of the Agent plan with no card. Your code expires in 7 days, so please do this today.
2. Pick an onboarding call. Tuesday [date] at 12:00 or Thursday [date] at 17:30, 30 minutes on Zoom. [Link A] [Link B]
3. Before the call, add five past clients in Agent Desk. It takes about four minutes and it makes the call worth your time.

Your seat comes with the locked price of $59 per month or $590 per year for as long as you stay subscribed, 25 postcards on us, the Founding Agent badge, the private group chat, the monthly roadmap call, and first access to the Watchdog Intelligence add-on.

The group chat invite is at the bottom of this email. Say hello when you land.

One rule to know now: Watchdog shows you property reasons to reach out. It does not tell you who is going to sell, and we never describe it that way.

John

[Group chat link]
[Physical address] [Unsubscribe]

### RF-003: Group chat welcome (posted by John when each batch lands)

Welcome, batch [number]. Quick ground rules so this chat stays useful.

1. Ask anything here. Bugs, confusion, "why does this number say that," all of it. I answer here before anywhere else.
2. Post one thing a week that worked or did not work. A screenshot of a card you acted on, a client reply, a confusing screen.
3. Property facts, not people. Do not post owner names or anything about a homeowner's situation. Addresses on the public record are fine.
4. If you want a feature, say what you were trying to do when you needed it. That gets it built faster than the feature name.

Roadmap call Thursday November 12 at 12:00. Calendar invite is coming.

### RF-004: 60-day check-in (email; subject line: 60 days in. Two questions.)

[First name],

You have had Watchdog for 60 days. Two questions, and then I will get out of your way.

1. What did you do with it that you would not have done otherwise? A conversation, a postcard run, a client you called because of a card. Reply with one sentence.
2. What is still annoying? Reply with one sentence.

If you have not opened it in a couple of weeks, tell me that too. It is more useful to me than silence.

Your locked price and your Founding benefits stay as long as you stay subscribed. If anything about billing looks wrong on your Account page, reply and I will fix it.

John

### RF-005: The story request (email or chat message; sent only to agents who have used it weekly and who agreed to be asked)

[First name],

You mentioned [the thing they mentioned in the check-in or chat]. That is the kind of story other agents believe, because it is specific.

Would you let me write it up? It would be about 150 words on the agent page, with your name, brokerage, and town, and the property described without the address. You approve every word before it goes anywhere, and you can pull it later.

If the answer is no, that is completely fine and nothing changes. If yes, reply with the one detail I should not get wrong.

John

### RF-006: Waitlist reply (email; subject line: Your Founding Agent request, and where you are on the list)

[First name],

Thanks for applying. You are on the Founding Agents waitlist. Invites go out twenty at a time on Mondays, and we work through the list in order with an eye on spreading seats across counties and offices.

While you wait: property lookup is free at www.watchdogindex.com. Run your last closed sale and look at the assessment history and the Watchdog Score. That is the part of the product most agents ask about first.

We also run a 30-minute open Q and A on New Jersey property taxes for agents on October 22 and November 19 at 12:00. Ask anything. [Registration link]

John

### RF-007: Not-a-fit reply (email; used for out-of-state or non-agent applicants)

[First name],

Thanks for your interest. The Founding Agents program is for New Jersey licensed agents only, so I cannot offer you a seat. If you work with New Jersey property as an attorney, lender, appraiser, or investor, the Pro plan at www.watchdogindex.com/pro is the right fit and I am glad to talk about it.

John

### RF-008: Activation nudge (email, day 5 after redemption; subject line: Four minutes, five clients)

[First name],

You redeemed your Founding Agent code on [date]. Three things make the first Monday email worth reading:

1. Add five past clients in Agent Desk (Clients tab). Watchdog matches them to parcels.
2. Draw your farm on the map, or skip it if you do not farm.
3. Finish lesson 1 in Agent Academy at www.watchdogindex.com/agent/training. Eight minutes.

Then open the Opportunity Desk Monday morning. If nothing shows up, tell me and I will look at why.

John

### RF-009: Cohort full (email to the whole waitlist the day seat 100 is redeemed)

[First name],

The Founding Agents cohort filled today. Thank you for applying.

[If checkout is open:] The Agent plan is open to everyone now. Start your 14-day Agent trial at www.watchdogindex.com/agents/trial. Card required, $59 per month after, cancel anytime before day 14 and you pay nothing.

[If checkout is not open:] You are on the list for the next open batch and you will hear from me first.

If you are near Atlantic City on December 8, I am hosting a dinner for Founding Agents and a few guests during Triple Play. Reply if you want a seat.

John

## Metrics

Definitions are fixed here so every recap uses the same words.

| Metric | Definition | How measured | Target |
| --- | --- | --- | --- |
| Activation | All four within 7 days of redemption: Agent Academy lesson 1 complete, 5 clients added, farm drawn (or explicitly skipped), Opportunity Desk opened on the first Monday after the weekly email. | Engineering: an admin query on the four events. Fallback: Coordinator sheet updated from onboarding calls and the day-5 nudge replies. | 70% of redeemed seats. |
| Weekly active | Opened Agent Desk or the Opportunity Desk at least once in the calendar week. | Engineering query, or self-report in the group chat as a fallback. | 60% of the cohort in week 4; 50% in week 8. |
| Paid conversion | Started a paid Agent plan (monthly or yearly) by the end of the invite trial. Only measurable once checkout is open. | Stripe. | 50% of activated agents. |
| Referrals per Founding Agent | Invite links sent (self-reported), accounts started with the agent's code, paid plans started with the agent's code. | Referral tracking sheet (see referral-program.md) and the account-page referral data. | 0.5 paid referrals per Founding Agent by December 18. |
| Feedback calls done | 15-minute calls completed. | Coordinator sheet. | 80% of activated agents by day 45. |
| Stories | Approved, published agent stories. | Coordinator sheet. | 5 by December 6. |

Report these every Friday in the pipeline review and in each Phase recap.

## Weekly rhythm (Coordinator)

- Monday 08:00: send acceptance messages for the batch. Post the batch code in John's notes. Update the seat count.
- Tuesday 12:00 and Thursday 17:30: onboarding calls (John runs, Coordinator takes notes and logs activation).
- Wednesday: day-5 nudges to anyone from the prior batch who is not activated.
- Friday 14:00: application review, waitlist ranking, freed-seat reassignment. John approves the next 20.
- Friday 16:00: pipeline review; report the metrics table.

## Owner decisions (John)

1. Locked-price mechanism: Stripe coupon vs. a locked price object. Decide before October 12.
2. 25-postcard credit: confirm manual mail-credit grant is possible; if not, decide whether to promise it now and fulfill it when engineering lands, or drop it from the offer.
3. Group chat tool: [WhatsApp, Signal, or Slack].
4. 30-day vs 60-day codes if the billing gate is not open (decide Friday October 9).
5. Application form location and tool.
6. Whether Founding Agents page names go live before the badge ships.
7. First-access terms for the Watchdog Intelligence add-on.

## Engineering needs

1. Founding Agent badge on /agent/you and shareable property pages.
2. Founding Agents page (static list, opt-in names).
3. Manual mail-credit grant, if it does not exist.
4. Admin query for the four activation events and weekly active, so the Coordinator is not hand-counting.
5. Flag-gated first access to the Watchdog Intelligence add-on, if that is how the add-on is gated.
