# Referral program

Folder: 06-recruitment-referral-partners. Owner: John. Coordinator keeps the tracking sheet. Live mechanic runs all quarter; the contest layer runs Phase 2 into Phase 3 (November 2 to December 18).

## The live mechanic, in one paragraph an agent will understand

Your Account page has an invite link that looks like www.watchdogindex.com/pro?invite=CODE. Send it to another professional. If they start a yearly plan, you get one month of your own plan free. It is credited to your bill once their plan has been active for 90 days. That is it. No forms, no cash, no cap on how many people you invite. One reward per person you refer, and you cannot refer yourself.

That paragraph matches the plans-page FAQ and the account-page wording today. Do not promise anything faster than 90 days or anything other than a month credit, because that is what the product does.

## What is already built and what is not

| Piece | Status |
| --- | --- |
| Invite link on the Account page, format /pro?invite=CODE | Live. |
| Month credit after the referred yearly plan has been active 90 days | Live (a scheduled sweep credits it). |
| Referral counting for monthly plans | Not a reward in the product. Monthly signups only count in the Q4 contest, tracked by hand. |
| In-app referral prompt outside the Account page | Needs engineering. Fallback: the same copy runs in the weekly agent email. |
| Contest leaderboard | No engineering. Coordinator posts it in the Founding Agents group chat every Friday. |
| Contest prizes | Owner decision. Fulfilled by hand (Stripe credit, mail credit, a dinner seat). |

## Q4 layer: the Founding Agent referral contest

Window: Monday November 2 to Friday December 18. Winners announced Monday December 21 in the group chat and the weekly email.

Who is eligible: activated Founding Agents (see founding-agent-program.md for the activation definition). Ambassadors are eligible; they are Founding Agents too.

What counts (owner decision, recommended):

- A referred New Jersey agent who starts a paid yearly Agent plan through the referrer's link inside the window: 3 points.
- A referred agent who starts a paid monthly Agent plan inside the window: 1 point.
- If public checkout is not open for part of the window, a referred agent who redeems an invite code from the referrer and reaches activation: 1 point. This keeps the contest alive in either billing state.
- Ties break on earliest paid start.

Prizes (owner decision; placeholders that need no engineering):

1. First place: [a year of Agent, applied as a $590 credit to the winner's account].
2. Second place: [a seat at the Watchdog dinner at Triple Play on December 8, plus 100 postcards on us as $179 in mail credit at $1.79 per card].
3. Third place: [50 postcards on us as $89.50 in mail credit at $1.79 per card].

Prizes are separate from the live month credit. A winning referral still earns the referrer the live month credit after 90 days, because that is how the product works and we do not switch it off for the contest.

Leaderboard: first name and brokerage only, with consent, posted Fridays at 16:00 in the group chat starting November 6. Anyone can opt out of being listed and still win.

Contest launch message, posted in the group chat November 2 (RF-025):

Referral contest starts today and runs through December 18. Your invite link is on your Account page. A referred agent who starts a yearly plan is 3 points, monthly is 1. Top three win: [prize 1], [prize 2], [prize 3]. Leaderboard here every Friday. One rule above all: if you post your link publicly, say that you get a month free when someone signs up through it. Copy you can forward is pinned above.

## In-app prompt copy (needs engineering to place; fallback is the weekly email)

RF-010, general, shown on Agent Desk Home:
Know an agent who would use this? Send your invite link. When they start a yearly plan, you get a month free, credited after 90 days. [Copy link]

RF-011, after an action, shown after a postcard proof is approved or an Opportunity Desk outcome is recorded:
You just acted on a property reason. Know an agent who would want a Monday list like this? Share your invite link. A yearly signup from them is a month free for you, credited after 90 days. [Copy link]

RF-012, Founding Agents only, November 2 to December 18:
The Founding Agent referral contest runs through December 18. Every paid referral counts. Your invite link is on your Account page. [Open Account]

## Account-page referral card copy (RF-013; needs engineering to change; current wording is an acceptable fallback)

Title: Invite a professional, get a month free

Body: Share your link. When a professional you invite starts a yearly plan, one month of your plan is credited to your bill after their plan has been active for 90 days. One reward per referred account. You cannot refer yourself.

Link line: www.watchdogindex.com/pro?invite=[CODE] [Copy link]

Small print: If you post this link publicly, say that you get a month free when someone signs up through it.

## Forwardable copy the agent sends

All variants are under 80 words. The agent replaces [Name], [CODE], and [Your name]. Only send a variant that is true for you. Texts go only to people you already know and who would expect to hear from you; no cold texting. Every variant carries the disclosure because a reward is possible.

### Email

RF-014, subject: The tool I use before I call a past client

[Name], I started using Watchdog this fall. It is New Jersey property data in one place: assessment history, Chapter 123 context, verified sales, permits, with the source on every number. Every Monday it tells me which past clients have a property reason to hear from me. Here is my invite link: www.watchdogindex.com/pro?invite=[CODE]. Full disclosure: if you go yearly, I get a month free. [Your name]

RF-015, subject: Before the 2027 assessment notices land

[Name], your past clients will get 2027 assessment notices around February 1 and some of them will call you. I use Watchdog to see the assessment history and Chapter 123 position on any NJ property, with sources. It is $59 a month. My invite link: www.watchdogindex.com/pro?invite=[CODE]. If you pick the yearly plan I get a month free, so you know. [Your name]

RF-016, subject: Postcards that say something about the property

[Name], I mailed my farm through Watchdog's Postcard Studio. $1.79 a card on the Agent plan, printing and postage included, and the card can talk about what changed in the town. The rest of the tool is the NJ property record with sources attached. Invite link: www.watchdogindex.com/pro?invite=[CODE]. Disclosure: a yearly signup gets me a month free. [Your name]

### Text (only to agents you know)

RF-017:
Hey [Name], it's [Your name]. The NJ property tool I mentioned is Watchdog. Assessment history, Chapter 123, verified sales, all sourced. My link: www.watchdogindex.com/pro?invite=[CODE]. Heads up, I get a month free if you go yearly.

RF-018:
[Name], quick one. Run your last closed sale in Watchdog and look at the assessment history. Free lookup, no signup: www.watchdogindex.com. If you want the Agent plan, use my link: www.watchdogindex.com/pro?invite=[CODE]. I get a month free if you go yearly.

RF-019:
[Name], Monday morning Watchdog showed me two past clients with assessment changes worth a call. That is the whole reason I pay for it. Link if you want to try it: www.watchdogindex.com/pro?invite=[CODE]. Disclosure: a yearly signup is a month free for me.

### LinkedIn DM

RF-020:
[Name], saw your post about [topic]. I have been using Watchdog for the NJ property side of my work: assessment history, Chapter 123 context, verified sales, permits, with the source on every number. Built for NJ agents, $59 a month. My invite link: www.watchdogindex.com/pro?invite=[CODE]. To be upfront, I get a month free if you choose yearly.

RF-021:
[Name], you work [County], right? Watchdog's Town Compare puts municipal tax and assessment context side by side, which I use in buyer conversations. Free lookup at www.watchdogindex.com. If you want the Agent plan, my invite link is www.watchdogindex.com/pro?invite=[CODE]. Disclosure: a yearly signup gets me a month free.

RF-022:
[Name], not a pitch, a tool tip. Watchdog gives me a Monday list of past clients with a property reason to reach out: an assessment change, a permit, a verified sale nearby. Not seller predictions, just reasons. www.watchdogindex.com/pro?invite=[CODE]. I get a month free if you go yearly, so you know.

## Office-wide referral: "bring your whole office"

When an agent says "my whole office should see this," do not hand them ten invite links. Hand the office to John.

The path:

1. The agent forwards RF-023 to their broker or office manager, or introduces John by email.
2. John books a 30-minute lunch-and-learn at the office (see brokerage-lunch-and-learn.md). The office gets its own invite code with a redemption cap equal to the attendee count, so every attendee who signs up is attributed to that office and to the agent who opened the door.
3. The opening agent's reward (owner decision): [100 postcards on us, $179 in mail credit at $1.79 per card] when the session happens and five agents from that office start paid Agent plans. This is on top of the live month credit for any of them who go yearly through the agent's own link.
4. The Coordinator records the office, the opening agent, and the office code on the tracking sheet the day the session is booked.

RF-023, the note an agent forwards to their broker:

[Broker first name], I have been using a New Jersey property tool called Watchdog and I think the office should see it. John Scafide, the founder, does a 30-minute lunch-and-learn on NJ property taxes for agents: assessment vs market value, Chapter 123, the October 1 valuation date, added assessments, and how to answer the tax questions buyers and past clients ask. It is education first; he shows the product for the last five minutes and brings lunch. Can I connect you? [Your name]. Disclosure: I am a Watchdog Founding Agent and I get referral credit if agents here sign up.

## Tracking sheet columns

One sheet, Coordinator owns it. One row per referred person.

date_logged, referrer_name, referrer_email, referrer_code, founding_agent (yes or no), ambassador (yes or no), referred_name, referred_email, referred_brokerage, referred_county, channel (email, text, linkedin, office, other), office_code (if via lunch-and-learn), account_started_date, plan (trial, invite, monthly, yearly), paid_start_date, day_90_date, live_credit_applied (date or blank), contest_points, contest_eligible (yes or no), disclosure_seen (yes or no, for public posts), notes

The Coordinator reconciles paid_start_date against Stripe every Friday before the leaderboard goes out.

## Rules

1. No self-referrals. A code used on an account with the same email, card, or person is void.
2. One reward per referred account, ever. A referred account that cancels and returns does not earn a second reward.
3. The live reward is one month of the referrer's own plan, credited after the referred yearly plan has been active 90 days. This is what the product does today and the contest does not change it.
4. The referred person must be new to paid Watchdog plans.
5. Rewards are credits, not cash, and are not transferable.
6. Contest prizes are awarded by hand from the tracking sheet on December 21. John's count is final.
7. Anyone who posts their link publicly must include the disclosure below.
8. No cold texting. Send texts only to people you know and who would expect to hear from you.
9. Do not post invite links in groups whose rules ban promotion. Answer questions honestly; if someone asks for a link, send it in a private message with the disclosure.
10. Watchdog can void referrals and remove contest eligibility for fraud, fake accounts, or misrepresenting the product (for example describing it as a list of people who are about to sell).

## FTC disclosure language for agents who post about Watchdog for a reward

The FTC Endorsement Guides require a clear disclosure of a material connection when someone endorses a product and could receive something for it. A free month, a contest prize, or Founding Agent benefits are material connections. The disclosure has to be where people will see it, in plain words, near the link or claim, not buried below "more."

Use one of these, word for word or close to it (RF-024):

- Short, for texts and DMs: "I get a month free if you sign up for a yearly plan through my link."
- For a public post: "Disclosure: I am a Watchdog Founding Agent. I get a month free, and could win a prize, when agents sign up through my link."
- For a video: say it out loud near the start ("Quick disclosure, I get a free month if you sign up through my link") and repeat it in the caption.
- For a story or reel with a link sticker: put the disclosure as text on the same frame as the link.

Not enough on their own: "#ad" alone, "#partner," "thanks Watchdog," or a disclosure only in a comment.

Also required in every public post: nothing that treats a homeowner as a prospect because of a public record. "Reasons to reach out," yes. "Find sellers," no.

## Owner decisions (John)

1. Contest scoring and whether invite-code activations count when checkout is closed.
2. The three prizes.
3. The office-opening agent reward.
4. Whether the leaderboard is public in the chat or private by email.

## Engineering needs

1. In-app referral prompts RF-010, RF-011, RF-012 (placement and the Founding Agents flag for RF-012).
2. Account-page card copy update (RF-013).
3. An export or admin view of referral code usage by account so the Coordinator is not asking agents to self-report every paid referral. Fallback: Stripe metadata review on Fridays.
