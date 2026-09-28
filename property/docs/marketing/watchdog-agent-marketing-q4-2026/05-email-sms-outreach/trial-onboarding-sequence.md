# Trial onboarding sequence

Two paths. Path A is the public front door: a card-required 14-day Agent trial that converts to $59 per month on day 14 unless cancelled. Path B is the Founding Agent invite path: a 30-day trial with no card, invite code, limited to 100 New Jersey agents.

Sender for all: John Scafide, Watchdog. Reply-to: [John's reply address]. Emails are triggered off trial start, not calendar dates. Day 0 is the day the trial starts. Send time for day-keyed emails: 08:00 ET local to the trial start day, except where noted.

Placeholders the ESP fills: [First name], [Trial end date] (day 14 or day 30), [Charge date] (same as trial end date on Path A), [One-click cancel link], [Account link], [Referral code].

Every email in this file that mentions the charge states the amount ($59), the day it happens, and how to cancel. The pre-charge reminder on day 11 (EM-T11 and SMS-T01) is required and cannot be suppressed by any behavioral rule.

Trial footer (append to every Path A email, below the sign-off):

> Trial facts: your card is charged $59 on day 14 ([Charge date]) unless you cancel before then. Cancel in one click: [One-click cancel link]. Watchdog, [physical mailing address]. [Unsubscribe from onboarding emails] (transactional billing notices still send).

UTM pattern: `?utm_source=email&utm_medium=onboarding&utm_campaign=q4-agents-<phase>&utm_content=<asset-id>`.

---

## Path A: card-required 14-day Agent trial

### EM-T00: day 0, welcome

Subject: Your Agent trial started. First 10 minutes
Preview: Lesson 1, five past clients, one farm. That is the whole setup.

Body:

Hi [First name],

Your 14-day Agent trial is live. Here is what to do in the next 10 minutes, in order.

1. Agent Academy lesson 1 (about six minutes). It is required for trial accounts and the rest of the product opens when you finish it. The three rules in it matter more than any feature.
2. Add five past clients in Clients. Names and addresses you already have. Watchdog matches them to parcels.
3. Draw a farm on the map. Any neighborhood you already work.

Then stop. Monday morning the Opportunity Desk sends the ten highest-value reasons to reach out across those addresses.

Billing, plainly: your card is on file and not charged today. It is charged $59 on day 14, [Charge date], unless you cancel before then. Cancel is one click from Account. I will remind you on day 11 by email and text.

John Scafide
Watchdog

CTA: Start lesson 1 -> /agent/training

Trigger note: send immediately on trial start. Always send.

---

### EM-T01: day 1, first Opportunity Desk look

Subject: Now, This week, Watch
Preview: How to read your desk so you do not waste a call.

Body:

Hi [First name],

Open Agent Desk and look at the Opportunity Desk. Three columns.

Now: something material and fresh happened on a property tied to someone you know, and the source is solid. Reach out this week.

This week: a real reason, a little older or a little smaller. Worth a touch in the next few days.

Watch: something is developing. Nothing to say yet. Let it sit.

Every card shows the reason, the confidence, the source date, wording that is safe to say to a homeowner, and a next action. Copy the wording. It is written so you never imply the owner wants to sell, because a public record does not tell you that.

The opening view is capped at ten properties on purpose. You can snooze a card, record what happened, or open the property.

If your desk is empty, it is because you have not added clients yet. Five is enough to start.

John

CTA: Open your desk -> /agent-desk

Trigger note: send day 1 at 08:00 ET. If the account has zero clients and no farm, swap the last paragraph for: "Your desk is empty because nothing is in it yet. Add five past clients and it fills by Monday." If lesson 1 is not complete, add one line at the top: "Lesson 1 is still open and it gates the rest of the product. Six minutes."

---

### EM-T02: day 2, Town Compare for a buyer

Subject: Two towns, one buyer, one screen
Preview: The question every buyer asks and most agents answer from memory.

Body:

Hi [First name],

"Why are taxes so different in these two towns?" You have heard it. Here is how to answer it without guessing.

Open Town Compare and put in the two towns your buyer is deciding between. You get the municipal tax and assessment context side by side: the town's ratio, the effective rate, the revaluation status, and how assessments have been moving. Each number carries its source and date.

The point is not to pick a town for them. The point is to explain why a $600,000 house in one town carries a different bill than a $600,000 house next door, and that the assessment on the listing sheet is a tax-administration value, not a price.

Send the buyer the comparison. It makes you the agent who explained it instead of the agent who shrugged.

Try it with a real pair of towns you are working now. 564 municipalities are in there.

John

CTA: Open Town Compare -> /town-compare

Trigger note: send day 2 at 08:00 ET. Skip if the account has already used Town Compare; replace with EM-T02-alt (same subject, body opens "You already found Town Compare. Here is the part most people miss: the public property page.") pointing to /nj/[town]/[address].

---

### EM-T03: day 3, Postcard Studio

Subject: Your first farm mailer, $1.79 a card
Preview: Current Resident, minimum 50, printed and mailed for you. Here is when to send one.

Body:

Hi [First name],

You drew a farm on day 0. Here is what to do with it.

Postcard Studio designs, proofs, and mails a 6 x 8.5 postcard First Class. $1.79 per card on the Agent plan, printing and postage included. Minimum 50 mailable addresses. Cards that cannot be mailed come back as mail credit.

Owner names are not public in New Jersey, so cards go to "Current Resident." What is different is the reason. A card that goes out the week a town mails revaluation notices, or when added-assessment bills land in October, is read. A random "just sold" card is not.

Two rules before you hit proof. Your name, brokerage, and any disclosure your broker requires go on the card. And the card is about the property fact, not a promise about the market.

You do not have to mail during the trial. Build one and proof it so you know how it works.

John

CTA: Open Postcard Studio -> /agent-desk

Trigger note: send day 3 at 08:00 ET only if a farm exists. If no farm exists, send EM-T03-alt: subject "Draw a farm first (two minutes)," body walks through the map, then a single line about Postcard Studio.

---

### EM-T05: day 5, reading the Watchdog Score

Subject: How to read the Watchdog Score
Preview: Zero to 100, six letters, evidence beside every number. And what not to say.

Body:

Hi [First name],

Every property in Watchdog carries a Watchdog Score from 0 to 100, powered by the ROBUST Framework. Six pieces:

Recourse: is there a real path to review the assessment.
Overassessment Position: where the assessment sits against the town's ratio and Chapter 123 range.
Burden: what the tax carrying cost looks like.
Uniformity: how evenly similar properties are assessed.
Stability: how much the assessment and bill have moved.
Trajectory: which direction things are heading.

The evidence sits beside the score, with the source and date. Open it before you repeat anything.

What to say to a client: "The assessment looks high against the town's ratio. That is worth a review before the deadline."

What not to say: "You will win an appeal." "Your taxes will drop." "This town is unfair." The score is a research signal, not an appraisal, a legal opinion, or an appeal conclusion. The methodology is public if a client asks.

John

CTA: Read the methodology -> /data-methodology

Trigger note: send day 5 at 08:00 ET. Always send. If the account has not looked up a single property, prepend: "You have not opened a property yet. Look up your own house first. It is the fastest way to understand the score."

---

### EM-T07: day 7, your first Monday desk

Subject: Your Monday desk, explained
Preview: The weekly email, what is in it, and what to do in 20 minutes.

Body:

Hi [First name],

Every Monday morning Watchdog emails you the ten highest-value new or materially changed items from your Opportunity Desk. Not a digest of everything. Ten, ranked.

Here is the 20-minute routine that works:

Read the ten. For each Now card, copy the homeowner-safe wording and send it the way you normally talk to that person. Text, call, email, whatever they expect from you.

For This week cards, put them in your calendar for Wednesday.

Leave Watch alone.

Record what happened on each card. The performance panel counts touches, replies, valuation requests, appointments, and listings. It does not count how many people are "in your pipeline," because that number never meant anything.

Routine source refreshes never enter the desk. If a card is there, something material changed, with a date.

One week in, halfway through the trial.

John

CTA: Open your desk -> /agent-desk

Trigger note: send day 7 at 08:00 ET. If day 7 falls Tuesday through Sunday, send anyway; add "Your next Monday email arrives [date]." If the account has recorded zero touches and has three or more Now cards, add a line: "You have [N] Now cards waiting. Pick one."

---

### EM-T09: day 9, verified share page and public property pages

Subject: A page with your name on it
Preview: Your verified share page and the property pages you can send to any client.

Body:

Hi [First name],

Two things in Watchdog are built to leave the app and land in front of clients.

Your verified share page is at /agent/you. It carries your name, brokerage, and a verified mark. Put it in your email signature and on your listing presentations. When you share a property from Watchdog, it is attributed to you.

Public property pages live at /nj/[town]/[address]. Each one carries the record, assessment and tax history, verified sales context, and a PDF report, with the source and date attached. There is a share bar. Send one to a buyer before a showing or to a past client after their assessment changes. The client sees the facts and your name.

This is how "the property story is already there when I need it" happens, as one NJ real estate agent put it.

Try it: open any property, hit share, send it to yourself.

John

CTA: Set up your share page -> /agent/you

Trigger note: send day 9 at 08:00 ET. Skip if the account has already shared three or more property pages; replace with a one-line "you are already using share pages, here is the PDF report" note.

---

### EM-T11: day 11, required pre-charge reminder

Send at 09:00 ET. Required. Not suppressible by any behavioral rule. Pair with SMS-T01 if SMS consent exists.

Subject: Your card is charged $59 in 3 days
Preview: Day 14 is [Charge date]. One click to cancel, or switch to annual.

Body:

Hi [First name],

Plain statement, no pitch.

Your 14-day Agent trial ends on [Charge date]. On that day your card on file is charged $59 for the first month of the Agent plan, unless you cancel before then.

Cancel in one click: [One-click cancel link]. It takes effect immediately and nothing is charged. You can also do it from your Account page.

If you want to keep going, you do not need to do anything. The charge happens on day 14 and your desk keeps running.

If you already know you are staying, you can switch to annual now: $590 per year, which is ten monthly payments instead of twelve. Switch from Account before [Charge date] and the annual amount replaces the $59 charge.

Questions about billing, reply to this email and I will answer personally.

John Scafide
Watchdog

CTA: Manage billing -> [Account link]

Trigger note: send day 11 at 09:00 ET to every active Path A trial. Always send. Log delivery as compliance evidence.

---

### EM-T12: day 12, the case for annual

Subject: Ten payments instead of twelve
Preview: Annual is $590. If you are staying, here is why to switch before day 14.

Body:

Hi [First name],

If you are staying, and only if, here is the case for annual.

The Agent plan is $59 per month or $590 per year. Annual is ten monthly payments; months eleven and twelve are on us.

If you pay before December 31, it is a 2026 business expense. Ask your accountant, not me, but most agents I talk to would rather have the receipt in this year.

Switch from your Account page before [Charge date]. The $590 annual amount replaces the $59 monthly charge that is otherwise scheduled for day 14.

If you are not staying, ignore this and cancel in one click: [One-click cancel link]. You will not be charged.

Either way, the reminder from yesterday stands: $59 on [Charge date] unless you cancel.

John

CTA: Switch to annual -> [Account link]

Trigger note: send day 12 at 08:00 ET. Skip for accounts that have already cancelled or already switched to annual. Skip for Founding Agents on Path B.

---

### EM-T13: day 13, last day

Subject: Last day of your trial
Preview: What happens tomorrow, and the refund rule in one sentence.

Body:

Hi [First name],

Tomorrow, [Charge date], is day 14. Here is exactly what happens.

If you do nothing: your card is charged $59 for the first month of the Agent plan. Your desk, clients, farm, and monitored properties carry over untouched.

If you cancel before then: nothing is charged. One click: [One-click cancel link].

Refund rule: if you are charged tomorrow and change your mind within 7 days, reply to the receipt email and the first charge is refunded. No form, no argument.

If you have not finished lesson 1 or added clients yet, that is a sign the timing is not right, and cancelling is the correct call. Come back in appeal season. Your account stays and your data waits.

John

CTA: Manage billing -> [Account link]

Trigger note: send day 13 at 08:00 ET to every active Path A trial that has not cancelled. Always send.

---

### EM-T14-A: day 14, welcome to paid

Subject: You're on the Agent plan
Preview: Charged $59 today. Refund within 7 days if you ask. Here is what to set up next.

Body:

Hi [First name],

Your card was charged $59 today for the first month of the Agent plan. Receipt is in a separate email. If you change your mind within 7 days, reply to that receipt and it is refunded.

You can cancel any time from Account. Monthly renews on [next renewal date].

Three things worth doing this week now that you are staying:

Fill your 25 monitored properties. Past clients first, then active deals.

Turn on Property Pulse alerts for assessment, permit, and deed changes on those 25.

Put your verified share page (/agent/you) in your email signature.

Your Monday email keeps coming. Reply to any of them if a card looks wrong. I look at every one.

Thanks for staying.

John Scafide
Watchdog

CTA: Fill your watchlist -> /agent-desk

Trigger note: send on successful day 14 charge. Transactional.

---

### EM-T14-B: day 14, sorry to see you go

Subject: Your trial ended. Nothing was charged
Preview: Your account and data stay. One question, if you have 30 seconds.

Body:

Hi [First name],

Your 14-day Agent trial ended and you cancelled, so nothing was charged. Your account, clients, farm, and any postcards you proofed are still there on the free plan (property lookup and limited monitoring).

One question, reply with a number:

1. Not enough time to try it
2. Did not see enough reasons on the desk
3. Price
4. Needed something it does not do (tell me what)
5. Something else

I read every reply. If it was timing, assessment notices mail by February 1 and the 2027 appeal deadline is April 1 in most towns. That is when past clients start asking questions.

John

CTA: Reply with a number

Trigger note: send on cancellation or on day 14 with no payment method. Transactional. Suppresses EM-X01 (this email replaces it).

---

### EM-T16: day 16, Founding Agent benefits and the referral link

Subject: Your referral link, and the Founding cohort
Preview: One free month when a pro you invite starts a yearly plan. Here is how it works.

Body:

Hi [First name],

Two things now that you are on the plan.

Your referral link is on your Account page. It looks like www.watchdogindex.com/pro?invite=[Referral code]. When a professional you invite starts a yearly plan, you get one month of your own plan free, credited after their plan has been active 90 days. Monthly sign-ups do not trigger the credit. Only yearly.

If you joined in the first 100 paying New Jersey agents, you are a Founding Agent. What that means: a direct line to me, a monthly update on what is being built and why, first look at new features before they ship, [additional Founding benefit, confirm with John], and the option of Agent Founding Lifetime at $1,499 one time when enrollment opens.

If you are not in the cohort, the referral link works the same.

John

CTA: Get your referral link -> [Account link]

Trigger note: send day 16 at 08:00 ET to paid accounts only. Use the Founding paragraph only if the account carries the Founding flag; otherwise drop it.

---

## SMS reminders (Path A)

Only to numbers with the SMS consent checkbox ticked at signup. Sender ID: Watchdog. Every text includes STOP. Do not send before 09:00 or after 20:00 ET.

### SMS-T01: day 11, pre-charge reminder (required)

Text:
Watchdog: your 14-day Agent trial ends [Charge date]. Your card is charged $59 that day unless you cancel first: [short cancel link]. Reply STOP to end texts.

Trigger: day 11, 09:15 ET, every active Path A trial with consent. Pair with EM-T11.

### SMS-T02: day 13, last day

Text:
Watchdog: tomorrow is day 14. $59 is charged to your card unless you cancel: [short cancel link]. Staying? Do nothing. Reply STOP to end texts.

Trigger: day 13, 09:15 ET, every active Path A trial with consent that has not cancelled.

### SMS-T03: onboarding call reminder

Text:
Watchdog: your onboarding call with John is [day] at [time] ET. Link: [meeting link]. Reply here to move it. Reply STOP to end texts.

Trigger: 24 hours before a booked onboarding call, and again 1 hour before. Booked calls only.

---

## Path B: Founding Agent invite, 30-day no-card trial (EM-B01 to EM-B08)

Same footer as Path A, with this line instead of the card line: "No card is on file. Your trial ends day 30, [Trial end date]. Nothing is charged unless you add a card. Watchdog, [physical mailing address]. [Unsubscribe from onboarding emails]."

### EM-B01: day 0, welcome, Founding Agent

Subject: You're in. Founding Agent, first 10 minutes
Preview: Invite code accepted. Lesson 1, five past clients, one farm.

Body:

Hi [First name],

Your invite code worked. You are one of at most 100 New Jersey agents in the Founding cohort, and your 30-day Agent trial is live with no card on file.

First 10 minutes, in order:

1. Agent Academy lesson 1 (about six minutes, required, opens the rest of the product).
2. Add five past clients in Clients.
3. Draw a farm on the map.

Then stop. Monday morning the Opportunity Desk emails you the ten highest-value reasons to reach out across those addresses.

What Founding means: you have a direct line to me. Reply to any email. If a card on your desk is wrong, or a number does not match what the town shows, tell me. That is the job of this cohort.

Day 30 is [Trial end date]. Nothing is charged unless you add a card. I will ask on day 26, not before.

John Scafide
Watchdog

CTA: Start lesson 1 -> /agent/training

Trigger: on invite redemption. Always.

### EM-B02: day 1, first desk look

Subject: Now, This week, Watch
Preview: How to read your desk so you do not waste a call.

Body:

Hi [First name],

Open Agent Desk and look at the Opportunity Desk. Three columns.

Now: something material and fresh happened on a property tied to someone you know, and the source is solid. Reach out this week.

This week: a real reason, a little older or a little smaller. Worth a touch in the next few days.

Watch: something is developing. Nothing to say yet. Let it sit.

Every card shows the reason, the confidence, the source date, wording that is safe to say to a homeowner, and a next action. Copy the wording. It is written so you never imply the owner wants to sell, because a public record does not tell you that.

The opening view is capped at ten properties on purpose. You can snooze a card, record what happened, or open the property.

If your desk is empty, it is because you have not added clients yet. Five is enough to start.

John

CTA: Open your desk -> /agent-desk

Trigger: day 1, 08:00 ET. Same lesson-1 and empty-desk variants as EM-T01.

### EM-B03: day 3, the workflow in one page

Subject: The whole workflow, one page
Preview: Town Compare for buyers, Postcard Studio for farms, the Watchdog Score for everyone.

Body:

Hi [First name],

You have 30 days, so here is the map instead of a drip.

Buyers: Town Compare (/town-compare) answers "why are taxes different in these two towns" with the source attached. Send the comparison.

Farm: Postcard Studio mails a 6 x 8.5 card First Class for $1.79 per card, minimum 50, to Current Resident. Your name, brokerage, and broker disclosure on every card.

Any property: the Watchdog Score, 0 to 100, powered by the ROBUST Framework. Evidence beside the score. It is a research signal, not an appraisal or an appeal conclusion.

Clients: your verified share page (/agent/you) and public property pages (/nj/[town]/[address]) with a PDF report.

Monitoring: up to 25 properties on Agent with Property Pulse change alerts.

Pick one real thing you do every week and run it through Watchdog. That is the test.

John

CTA: Open Agent Desk -> /agent-desk

Trigger: day 3, 08:00 ET.

### EM-B04: day 7, first Monday desk and a request

Subject: Your Monday desk, and one favor
Preview: The weekly email explained. Then tell me what was wrong.

Body:

Hi [First name],

Every Monday morning Watchdog emails you the ten highest-value new or materially changed items from your Opportunity Desk. Not a digest of everything. Ten, ranked.

The 20-minute routine that works: read the ten. For each Now card, copy the homeowner-safe wording and send it the way you normally talk to that person. Put This week cards in your calendar for Wednesday. Leave Watch alone. Record what happened on each card; the performance panel counts touches, replies, valuation requests, appointments, and listings, and nothing else.

Routine source refreshes never enter the desk. If a card is there, something material changed, with a date.

One favor. Reply to this email with one card from your desk that was useful and one that was not, and why. Two sentences each. This is how the desk gets better before it reaches 53,000 New Jersey agents.

John

CTA: Open your desk -> /agent-desk

Trigger: day 7, 08:00 ET.

### EM-B05: day 14, halfway

Subject: Halfway. What you have used, what you have not
Preview: Two weeks in. Here is your account in three lines and the parts you have not opened.

Body:

Hi [First name],

Two weeks in, two weeks to go. Your account, plainly:

Clients added: [N]. Monitored properties: [N] of 25. Desk cards opened: [N]. Touches recorded: [N]. Postcards proofed: [N].

Not opened yet: [list of unused features, ESP-generated].

If the numbers are low, that is fine, but it means the trial has not tested anything yet. Pick the one thing on the unused list closest to what you already do every week and try it this week.

If the numbers are up, reply and tell me the best card you got. I am collecting these, with your permission, for the first agent stories in November. Placeholder quote, never invented.

Day 30 is [Trial end date]. No card on file, nothing charged. I ask on day 26.

John

CTA: Open Agent Desk -> /agent-desk

Trigger: day 14, 08:00 ET. Always.

### EM-B06: day 21, Founding-only update

Subject: What changed this month, and what is next
Preview: Founding Agents see it first. Three changes, one question.

Body:

Hi [First name],

Founding update, short.

Shipped since you joined: [change 1, one line], [change 2, one line], [change 3, one line].

Being built now: [item], because [reason from cohort feedback].

One question: what does your broker's office need from a tool like this that a single agent does not? I am setting up office lunch-and-learns this fall and a 5-agent pilot for teams, and I would rather ask you than guess.

Nine days left. Day 30 is [Trial end date]. No card on file, nothing charged.

John

CTA: Reply with one sentence

Trigger: day 21, 08:00 ET. Skip if the account is inactive 14+ days; send EM-B06-alt instead: subject "Still here?" with a one-line ask to reply if the timing is wrong.

### EM-B07: day 26, the card ask

Subject: Day 26. Keep going at $59 a month or $590 a year
Preview: Four days left. Add a card to continue, or let it lapse. No auto-charge either way.

Body:

Hi [First name],

Your Founding Agent trial ends on day 30, [Trial end date]. There is no card on file, so nothing is charged automatically. To keep your desk, clients, farm, and monitored properties running past that date, add a card from your Account page and choose:

$59 per month, cancel any time, or
$590 per year, which is ten monthly payments and a 2026 expense if paid by December 31.

If you add a card, the first charge happens on [Trial end date], not today. If you add it and change your mind within 7 days of that first charge, reply to the receipt and it is refunded. Cancel any time after that from Account.

If you let it lapse, your account drops to the free plan on day 30. Your data stays.

Founding status stays with you either way. [Founding benefit line, confirm with John.]

John

CTA: Add a card -> [Account link]

Trigger: day 26, 09:00 ET. Always. Pair with SMS if consent exists (use SMS-T02 wording with "day 30" and "add a card" substituted; under 160 characters).

### EM-B08: day 30, last day

Subject: Day 30
Preview: Two versions of today. Here is yours.

Body (version 1, card added):

Hi [First name],

Today your Founding Agent trial converts to the Agent plan on the card you added: [$59 per month or $590 per year, ESP fills]. The first charge is today, [Trial end date]. Refund within 7 days if you ask; cancel any time from Account.

Fill your 25 monitored properties this week if you have not. Your referral link is on Account: one free month when a pro you invite starts a yearly plan, credited after 90 days.

Thank you for being in the first 100.

John

Body (version 2, no card):

Hi [First name],

Your Founding Agent trial ends today. No card on file, so nothing is charged. Your account drops to the free plan: property lookup and limited monitoring. Your clients, farm, and data stay.

If you want back in later, add a card from Account and everything picks up where it stopped. Assessment notices mail by February 1 and the regular appeal deadline is April 1 in most towns.

One question, reply with a number: 1 timing, 2 not enough desk reasons, 3 price, 4 missing feature, 5 other.

John

CTA (v1): Fill your watchlist -> /agent-desk. CTA (v2): Reply with a number.

Trigger: day 30, 08:00 ET. Version by card-on-file state. Version 2 suppresses EM-X01.
