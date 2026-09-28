# Post-trial, paying-customer, and dunning emails

Sender: John Scafide, Watchdog. Reply-to: [John's reply address]. All triggered, not calendar-dated, except EM-X04 (year-end window) and EM-X05 (Jan 5, 2027).

Footer on marketing emails: "Watchdog, [physical mailing address]. [Unsubscribe]." Dunning emails (EM-D series) are transactional and carry the Account link instead of an unsubscribe.

UTM pattern: `?utm_source=email&utm_medium=lifecycle&utm_campaign=q4-agents-<phase>&utm_content=<asset-id>`.

---

## Cancelled or expired trials (EM-X01 to EM-X05)

Applies to Path A trials that cancelled and Path B trials that lapsed without a card. If EM-T14-B or EM-B08 version 2 already sent, skip EM-X01 and start at EM-X02.

### EM-X01: day 1 after cancel or expiry, one question

Subject: One question, one number
Preview: Your trial ended. Nothing was charged. Tell me why in one reply.

Body:

Hi [First name],

Your Agent trial ended and nothing was charged. Your account is still there on the free plan.

One question. Reply with a number:

1. Not enough time to try it
2. Did not see enough reasons on the desk
3. Price
4. Needed something it does not do (tell me what)
5. Something else

I read every reply and I answer most of them. If it was 4, tell me what it was. There is a fair chance it is on the list.

John

CTA: Reply with a number

Trigger: 24 hours after cancellation or expiry, unless EM-T14-B or EM-B08 v2 already sent.

---

### EM-X02: day 7 after, what changed

Subject: What changed since you left
Preview: Three things shipped this week. One might be the one you were missing.

Body:

Hi [First name],

A week since your trial ended. Three things changed in Watchdog since then:

[Change 1, one line, from the release log]
[Change 2, one line]
[Change 3, one line]

If any of those is the thing you were missing, your account is still there. Add a card from Account and it picks up where it stopped: clients, farm, monitored properties, everything.

If not, nothing to do. You will hear from me a couple more times, then only when something real happens in the New Jersey tax calendar.

John

CTA: Reopen your account -> [Account link]

Trigger: 7 days after cancellation or expiry. Coordinator fills the three changes weekly from the release log. If the log is empty that week, hold to the next week.

---

### EM-X03: day 21 after, one specific use case

Subject: The past client whose assessment went up
Preview: One concrete thing to do with Watchdog this month, start to finish.

Body:

Hi [First name],

Here is one thing, start to finish, that a Watchdog agent does in October and November.

A past client's town mails added-assessment bills in October. The client finished a kitchen or an addition last year. Their assessment went up, the bill went up, and they are confused.

Watchdog's Opportunity Desk shows that property in the Now column with the reason (material assessment increase), the source date, and homeowner-safe wording. The agent sends a two-line text: "Saw your assessment changed after the permit closed. Want me to walk you through what it means before the December 1 appeal deadline?"

That is the conversation. No promise about winning anything. Just showing up with the right fact at the right week.

If you have a client like that, the Agent plan is $59 per month, cancel any time.

John

CTA: Restart the Agent plan -> [Account link]

Trigger: 21 days after cancellation or expiry, not sent to survey answer 4 (missing feature) unless the feature has shipped.

---

### EM-X04: day 45 after, year-end annual

Subject: Ten payments, and a 2026 receipt
Preview: Annual is $590. Paid before December 31, it is this year's expense.

Body:

Hi [First name],

Short one, because it is the same math every year.

The Agent plan is $59 per month or $590 per year. Annual is ten monthly payments. If you pay before December 31, it is a 2026 business expense. Ask your accountant.

The 2027 assessment notices mail by about February 1. The regular appeal deadline is April 1 in most towns, May 1 in towns that just revalued, and January 15 in Monmouth, Gloucester, and Burlington. Past clients start asking questions in February. Agents who already have their 25 monitored properties set up in December have the answers ready.

Your account is where you left it. Add a card, choose annual, done.

John

CTA: Choose annual -> [Account link]

Trigger: 45 days after cancellation or expiry, only if that date falls between Nov 16 and Dec 30. Otherwise skip to EM-X05.

---

### EM-X05: Jan 5, 2027, appeal-season hook

Subject: Notices mail next month
Preview: The 2027 appeal calendar, and why your past clients will call you first.

Body:

Hi [First name],

Happy new year. The part of the New Jersey tax calendar that makes agents useful is about to start.

Assessment notices mail by about February 1. Deadlines to appeal: April 1 in most towns, May 1 in towns with a completed revaluation or reassessment, January 15 in Monmouth, Gloucester, and Burlington under the alternate calendar. Always confirm with the county board.

Past clients will get a notice they do not understand. The agent who can say "your assessment sits above the town's Chapter 123 range, here is the source, here is the deadline" is the agent they remember.

Watchdog puts that on one screen for every property you monitor, with the source and date attached. $59 per month, $590 per year, cancel any time. Your account is where you left it.

John

CTA: Restart the Agent plan -> [Account link]

Trigger: send Jan 5, 2027, 07:30 ET, to every cancelled or expired trial from Q4 2026 that has not restarted. Schedule this in the ESP on Dec 30, 2026.

---

## Paying customers (EM-P01 to EM-P04)

### EM-P01: monthly value recap (template)

Subject: Your October in Watchdog
Preview: [N] reasons surfaced, [N] touches, [N] replies. Here is the month in one screen.

Body:

Hi [First name],

Your month, from your own account:

Properties monitored: [N] of 25
Opportunity Desk cards surfaced: [N] (Now [N], This week [N], Watch [N])
Touches you recorded: [N]
Replies, valuation requests, appointments, listings: [N], [N], [N], [N]
Postcards mailed: [N] at $1.79 each
Property pages shared: [N]

Most common reason on your desk this month: [reason type], which tracks with [one-line explanation, e.g., added-assessment bills mailing in October].

One thing to do this month: [Coordinator picks one from the unused-features list, e.g., "You have [N] open watchlist slots. Add the deals you are working now."]

Reply if any card looked wrong. I check every one.

John

CTA: Open your desk -> /agent-desk

Trigger: first Tuesday of each month, 08:00 ET, to every paying Agent account. Skip accounts under 14 days old.

---

### EM-P02: referral ask

Subject: One free month, one link
Preview: Invite a pro. When they start a yearly plan, your next month is on us.

Body:

Hi [First name],

You have been on the Agent plan for [N] weeks, so here is the referral deal, plainly.

Your link is on your Account page: www.watchdogindex.com/pro?invite=[Referral code]. When a professional you invite starts a yearly plan, you get one month of your own plan free, credited after their plan has been active 90 days.

Two honest notes. Monthly sign-ups do not trigger it; only yearly. And it is not a commission, it is a credit on your own bill.

Who to send it to: the agent in your office who keeps asking how you knew about the assessment change. Forward them the email in the next message from me if you want ready-made wording.

John

CTA: Get your referral link -> [Account link]

Trigger: 30 days after first successful charge. Pair with EM-R04 (forwardable copy) sent 2 days later.

---

### EM-P03: review request

Subject: 60 seconds, one honest review
Preview: If Watchdog earned it. If not, reply and tell me what would.

Body:

Hi [First name],

You have been on the Agent plan for [N] months and recorded [N] touches from the desk. If Watchdog has been useful, would you leave a short honest review on [Review platform]?

Link: [Review link]

Two or three sentences about what you actually use it for is more helpful than anything glowing. Agents read reviews looking for the specific job.

If it has not earned a review, reply and tell me what would change that. That reply is worth as much to me.

Thanks either way.

John

CTA: Leave a review -> [Review link]

Trigger: 75 days after first charge, only if touches recorded is 10 or more and no open support ticket. Never incentivize the review.

---

### EM-P04: annual switch

Subject: Switch to annual, save two payments
Preview: $590 a year instead of $59 a month. Before December 31 it is a 2026 expense.

Body:

Hi [First name],

You are paying $59 a month. Annual is $590, which is ten payments instead of twelve.

If you switch before December 31, the receipt lands in 2026. Ask your accountant whether that matters for you; for most agents it does.

Switch from your Account page. The annual charge replaces your next monthly renewal on [next renewal date]. Nothing else changes: same desk, same 25 monitored properties, same referral link.

If you would rather stay monthly, that is fine. Nothing to do.

John

CTA: Switch to annual -> [Account link]

Trigger: monthly Agent accounts with 2+ successful charges, sent once between Dec 1 and Dec 20, and again Dec 29 to any who did not open. Outside Q4, send once at 90 days without the year-end line.

---

## Failed payment (EM-D01 to EM-D03)

Transactional. Plain language. Retry schedule and the pause date come from billing settings; placeholders below. [Confirm grace period and retry days with billing before go-live.]

### EM-D01: day 0, payment did not go through

Subject: Your Watchdog payment did not go through
Preview: The $59 charge failed. Nothing is paused yet. Update the card in one minute.

Body:

Hi [First name],

The $59 monthly charge for your Agent plan did not go through today. Usually it is an expired card or a bank flag. Nothing is paused yet.

Update your card here: [Account link]. We retry automatically on [retry date 1]. If that works, you will not hear from me again about this.

If the card is fine and the bank blocked it, a quick call to them and a reply here usually sorts it.

John

CTA: Update your card -> [Account link]

Trigger: on first payment failure.

---

### EM-D02: day 3, second try

Subject: Second try on your card is [retry date 2]
Preview: Still failing. Your desk is running. Update the card to keep it that way.

Body:

Hi [First name],

The $59 Agent plan charge failed again on [retry date 1]. Your desk, clients, farm, and monitored properties are still running.

Next automatic try is [retry date 2]. If that one fails too, access pauses on [pause date] until the card is fixed. Nothing is deleted.

Update the card: [Account link]. If you want to switch to annual at the same time ($590, ten payments), you can do that on the same screen.

If you meant to cancel, do that here instead and I will stop writing: [One-click cancel link].

John

CTA: Update your card -> [Account link]

Trigger: 3 days after first failure, if still unpaid.

---

### EM-D03: day 7, access pauses

Subject: Access pauses [pause date]
Preview: Last note. Fix the card and everything picks up. Or cancel and I stop.

Body:

Hi [First name],

Last one from me on this.

The $59 charge for your Agent plan has failed [N] times. On [pause date], access pauses. Your account drops to the free plan. Nothing is deleted. Your clients, farm, monitored properties, and Monday desk history wait for you.

Fix the card and everything picks up immediately: [Account link].

If you are done, cancel here and there is no further charge or email: [One-click cancel link].

If something on our side is wrong, reply and I will look at it personally today.

John

CTA: Update your card -> [Account link]

Trigger: 7 days after first failure, if still unpaid. After pause, send no further dunning email; the monthly EM-P01 stops too.
