# Launch readiness checklist: what must be true before October 12

Owner column: John, Engineering, Legal, Coordinator, Designer. Status column is for you to fill in. Engineering statuses were checked against the repo and production on 2026-10-01; the other sections are outside the repo and still need the owner's update. Nothing here weakens the billing release gate; the gate decides whether the card door opens, and the invite door works either way.

## Engineering (due Fri Oct 9)

| # | Item | Owner | Status |
| --- | --- | --- | --- |
| E1 | Controlled Agent trial changed to 14 days with payment method always collected (see 01-strategy/trial-decision.md) | Engineering | Done 2026-10-01 (owner approved): 14-day card trial on Agent, Pro and Pro+, one per account, behind the same release gate. |
| E2 | Stripe Checkout custom text states the trial terms in plain words | Engineering | Done 2026-10-01: Checkout submit text states the end date, renewal price and how to cancel. |
| E3 | Webhook handles `customer.subscription.trial_will_end` and triggers the day-11 email and SMS | Engineering | Partly. Use Stripe's built-in reminder email (7 days before the trial ends; switch it on in Stripe settings). The webhook still records `trial_will_end` only as a subscription sync; no SMS. |
| E4 | Customer Portal allows immediate cancel during trial; Account page has a one-click "Cancel trial" | Engineering | Not verified (Stripe Portal setting). No "Cancel trial" button on Account. |
| E5 | SMS consent checkbox at signup, stored with timestamp; no consent, no text | Engineering | Not done. No SMS consent checkbox found. |
| E6 | `/agents/trial` landing page live with variant B (invite-only) ready to switch on | Engineering | Done. Shows the trial (variant A) while checkout is open, using `get_public_checkout_mode()`. |
| E7 | Thank-you page: Academy lesson 1, add 5 clients, draw a farm, book a 15-minute call | Engineering | Built. Scheduler link empty (falls back to /contact); invite text shows a literal "[N] business days". |
| E8 | GA4 events, Meta pixel and Conversions API, Google Ads conversion import, LinkedIn Insight Tag (spec: 04-paid-ads/utm-and-tracking.md) | Engineering | Partly. GA4 events fire on /agents/trial. Meta, Google Ads, LinkedIn, TikTok, Microsoft, Reddit, Pinterest, Snapchat, X and Nextdoor pixels built 2026-10-01 and switched off until IDs and the Privacy Policy update (property/docs/ad-tracking-setup.md). Conversions API not built. |
| E9 | Invite-code beta path tested end to end for an Agent-tier 30-day invite | Engineering | Partly. Beta invite path works in production (a 30-day Pro+ invite was redeemed 2026-09-22); an Agent-tier 30-day run was not verified. |
| E10 | Referral card on the Account page shows the invite link and the reward in plain words | Engineering | Not verified. An invite modal exists in the profile menu; reward wording not confirmed. |
| E11 | Plans page FAQ updated from "Is there a free trial? Not yet." once E1 ships | Engineering | Done 2026-10-01: Plans FAQ, buttons and banner offer the 14-day trial. |
| E12 | Founding Agent badge on the verified share page (optional, can ship in November) | Engineering | Not started (optional). |

## Legal and policy (due Fri Oct 9)

| # | Item | Owner | Status |
| --- | --- | --- | --- |
| L1 | Trial and auto-renew disclosure text reviewed (NJ automatic-renewal requirements, FTC negative-option practice) | Legal | |
| L2 | Refund on first charge within 7 days written into the billing support runbook and the terms page | Legal, John | |
| L3 | SMS program terms and privacy language for the consent checkbox | Legal | |
| L4 | Founding Agent program terms (price lock wording, what "for as long as you stay subscribed" means) | Legal, John | |
| L5 | Referral contest rules (no self-referrals, one reward per referred account, credited after 90 days) | Legal, John | |
| L6 | Ambassador and Founding Agent disclosure line for social posts (FTC endorsement guidance) | Legal | |

## Operations (due Wed Oct 7)

| # | Item | Owner | Status |
| --- | --- | --- | --- |
| O1 | Email platform set up with lists: launch list, trials, Founding, paying, cancelled, brokers, agents-warm | Coordinator | |
| O2 | Trial sequence automation built and tested with a test account (05-email-sms-outreach/trial-onboarding-sequence.md) | Coordinator | |
| O3 | Scheduler link for 15-minute onboarding calls and 30-minute broker calls | John | |
| O4 | Support inbox and a 24-hour reply rule during the window | John | |
| O5 | Tracking sheet live (06-recruitment-referral-partners/target-list-template.csv) | Coordinator | |
| O6 | Stripe test-mode dry run of the full trial: start, day-11 reminder, cancel, convert, refund | Engineering, John | |
| O7 | Weekly scorecard sheet created from 01-strategy/kpi-dashboard-template.csv | Coordinator | |

## Content and assets (due Fri Oct 9)

| # | Item | Owner | Status |
| --- | --- | --- | --- |
| C1 | First 20 short videos filmed and 10 posted (SV-001 to SV-010) | John | |
| C2 | First 10 LinkedIn posts scheduled, profile rewritten (03-social/linkedin-founder-playbook.md) | John | |
| C3 | Handles created or confirmed: Instagram @watchdogindex, LinkedIn page, Facebook page, YouTube | Coordinator | |
| C4 | Sell sheet and break-room flyer printed (07-traditional/office-flyers-and-sell-sheet.md) | Designer | |
| C5 | Static ad creatives CR-01 to CR-12 rendered in all three sizes (04-paid-ads/creatives) | Designer | |
| C6 | Launch press release approved with John's quote (07-traditional/press-release-and-pr.md) | John | |
| C7 | Weekly email issue 1 written and scheduled for Mon Oct 5 | John | |
| C8 | Founding Agent application form live | Coordinator, Engineering | |

## Commercial (due Fri Oct 9)

| # | Item | Owner | Status |
| --- | --- | --- | --- |
| M1 | Triple Play go or no-go decided Oct 2; booth booked Oct 5 if exhibitor | John | |
| M2 | Three lunch-and-learns booked for Oct 19 to Oct 30 | John | |
| M3 | Sixty-office broker target list built with contact names from public brokerage directories | Coordinator | |
| M4 | Ad accounts funded, geo set to New Jersey, pixels verified firing on a test conversion | Coordinator, Engineering | |
| M5 | Postcard office list of 300 addresses built for the Oct 5 drop | Coordinator | |
| M6 | Paid media tier chosen | John | |

## Launch day, Monday October 12

07:00 press release sent. 06:30 weekly email. 07:30 video SV-011 (launch). 07:45 LinkedIn launch post. 09:00 Founding invite batch 1 (20 codes) sent. 09:30 broker outreach block references the launch. 10:00 paid campaigns switched from content to trial (Phase 1 ad sets). 12:00 Reels. 17:00 Shorts. 18:00 John replies to every comment and DM from the day.

Gate check the Friday before (Oct 9, 16:00): if `live_billing_lifecycle` is not passed and public checkout is not open, switch `/agents/trial` to variant B and run the invite door only. Repeat the check every Friday in Phase 1.
