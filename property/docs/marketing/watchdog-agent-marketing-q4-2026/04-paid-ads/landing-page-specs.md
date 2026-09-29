# Landing page specs: `/agents/trial`, `/for/real-estate-agents` improvements, thank-you page

Follows `00-brief/product-and-brand-brief.md`. Every paid click in this folder lands on one of three pages: `/agents/trial` (new), `/for/real-estate-agents` (existing, improved), or a competitor page (`/pricing/propstream` and siblings, unchanged). This file specs the new page, the improvements, and the thank-you page.

Owner: Engineering builds, John approves copy, Coordinator wires tracking checks. Target: live on staging Oct 8, QA Oct 9, production by Oct 11 so it is warm before the Oct 12 door opens.

## 1. `/agents/trial`

### Routing and files

- Physical file: `property/agents/trial/index.html`. Thank-you: `property/agents/trial/thanks/index.html`.
- Public URL we market: `https://www.watchdogindex.com/agents/trial`. The routing layer (WatchdogIndex routing adapter and Vercel rewrites) must serve the clean route; check current `main` before editing either, per `AGENTS.md`. Never expose `/property/agents/trial` in canonical, Open Graph, share, or ad URLs.
- Canonical: `https://www.watchdogindex.com/agents/trial`. Indexable. Add to the sitemap generator (`api/watchdog-index-sitemap.js`). The thank-you page is `noindex`.
- GA4 (G-ENP9182L0J) and Microsoft Clarity are injected by the routing adapter (`api/watchdog-index-entry.js`); confirm they load on the new route rather than adding a second copy. Meta pixel and LinkedIn Insight Tag are added in the same adapter (see `utm-and-tracking.md`).
- `property/js/product-analytics.js` already captures first-touch and session UTMs; it must load on this page so `trial_started` carries `utm_content`.
- Header on this page: wordmark and "Sign in" only. No product menu, no footer navigation beyond the compliance footer. One page, one action.

### Two variants, one file

The page reads a server-side flag (the `live_billing_lifecycle` gate) and renders Variant A when public checkout is open and Variant B when it is not. Do not ship two files. Fire `view_landing` with a `variant` parameter (`a` or `b`) so reports split cleanly.

### Above the fold (Variant A)

- Eyebrow: For New Jersey real estate agents
- Headline: Know the property before you walk in.
- Subhead: Watchdog is New Jersey property intelligence: the assessment and tax history, Chapter 123 context, verified sales, permits, and town context in one view, with the source and date on every number. The MLS tells you what is for sale. Watchdog tells you what is underneath the listing.
- Primary CTA button: Start your 14-day Agent trial
- Secondary link: Request a Founding Agent invite
- Micro-line under the button: Card required. $59 per month after day 14 unless cancelled. Cancel in one click.
- Visual, right of the copy on desktop and below on mobile: the sample Opportunity Desk card from section "Page order" item 2, rendered as real HTML (not an image) so it loads fast and reads on screen readers. Label "Sample" in the card's top-right corner.

### The pricing disclosure block (exact text, placed directly under the hero and repeated above the FAQ)

> Start your 14-day Agent trial. A card is required to start. After day 14 your card is charged $59 per month unless you cancel before then. We send a reminder by email (and by text if you gave us a mobile number and agreed to texts) 3 days before the first charge. Cancel in one click from Account, any time. If you are charged and ask within 7 days of the first charge, we refund that charge. Annual billing is $590 per year, ten monthly payments for twelve months, and you can switch to it from Account.

No other price appears on the page except $1.79 per card and $1,499 for Agent Founding Lifetime in the plan snippet.

### Page order

1. Hero (above).
2. Sample Opportunity Desk card. Content, all labeled Sample:
   - Address: 123 Example Street, Sample Town, NJ
   - Rank: Now
   - Reason: Town reassessment announced. Assessment up 11.4% since 2024.
   - Confidence: High
   - Source: MOD-IV, Aug 2026; municipal notice, Sep 2026
   - Homeowner-safe wording: "Your town is reassessing for 2027. Here is what the public record shows for your property and the dates that matter. Happy to walk through it if useful."
   - Next action: Send the note. Offer a ten-minute call.
   - Caption under the card: Every card gives you the reason, the confidence, the source date, wording that is safe to say to a homeowner, and a next action. It is not a guess about what the owner wants to do. It is a real reason to reach out.
3. Three workflows, each a short block with one screenshot (product screen with sample data, "Sample" watermark) and three lines:
   - Before the appointment: Property Lookup with the Watchdog Score (0 to 100), powered by the ROBUST Framework: Recourse, Overassessment Position, Burden, Uniformity, Stability, Trajectory. Evidence beside the score.
   - Monday morning: Opportunity Desk, ranked Now, This week, Watch. Weekly email with the ten highest-value new items.
   - Your farm: draw a farm on the map, build the audience, send a mailer from Postcard Studio.
4. Postcard Studio price block: $1.79 per card on the Agent plan, printing and postage included. 6 x 8.5 postcards, mailed First Class. Minimum 50 mailable addresses. Owner names are not public in New Jersey, so cards go to "Current Resident." Cards that cannot be mailed come back as mail credit. Put your name, brokerage, and any broker-required disclosure on every card. Postcard costs are separate from the plan price.
5. Capacity, stated plainly: Monitor up to 25 properties on the Agent plan. Live lists and territories meters are shown in the app. Add clients and sphere without limit; monitoring applies to the properties you choose to watch. Need more than 25? See Pro and Pro+ on the plans page.
6. Plan comparison snippet (three columns, link to `/pro` for the full table):
   - Free, $0: property lookup, limited monitoring.
   - Agent, $59 per month or $590 per year: everything on this page. Watchdog Intelligence, including Watchdog Intelligence Voice, is an add-on.
   - Agent Founding Lifetime, $1,499 one time: lifetime access to Agent features, 25-property capacity, no monthly fees. Enrollment opens when billing opens. [Link only if enrollment is open.]
   - One line under the columns: Pro, Pro+, and Teams for attorneys, lenders, appraisers, investors, and offices are on the plans page.
7. FAQ, eight questions, marked up with FAQ structured data:
   - Q: What happens on day 14? A: Your card is charged $59 for the first month unless you cancelled. You get a reminder 3 days before. Cancel from Account in one click at any time before then and you pay nothing.
   - Q: Can I get a refund? A: Yes. If you are charged and ask within 7 days of the first charge, we refund that charge. Email the address on your receipt or use the button in Account.
   - Q: Is Watchdog an MLS replacement? A: No. Watchdog is the evidence companion beside the MLS. It is not an MLS, appraisal, title search, inspection, legal opinion, or tax-appeal conclusion. Assessments are tax-administration values, not list prices.
   - Q: Does Watchdog sell owner phone numbers or contact lists? A: No. Watchdog does not sell owner phone numbers, emails, skip tracing, or contact lists, and property data is not seller intent. Opportunity Desk gives you a property-triggered reason to reach out to people you already know, using contact data you already lawfully have.
   - Q: How many properties can I monitor? A: Up to 25 on the Agent plan, plus live lists and territories meters shown in the app. Pro and Pro+ have higher limits.
   - Q: What does a postcard cost? A: $1.79 per card on the Agent plan, printing and First Class postage included, minimum 50 mailable addresses. Cards go to "Current Resident." Undeliverable cards come back as mail credit.
   - Q: What is the Founding Agent cohort? A: The first 100 paying New Jersey agents. Same plan, plus a direct line to John while the product is being shaped. Request a Founding Agent invite and you get an invite code for an invite-only trial. No card is needed to request the invite.
   - Q: Where does the data come from? A: Public records: the property record, assessment and tax history (MOD-IV), Chapter 123 ratios, verified sales (SR1A), permits, municipal context, and flood or environmental screening. Every number shows its source and date. Details on the data methodology page.
8. Final CTA block: the disclosure block repeated, primary button, secondary link.
9. Compliance footer (small text): Watchdog is New Jersey property intelligence. It is not an MLS, appraisal, title search, inspection, legal opinion, or tax-appeal conclusion. Assessments are tax-administration values, not list prices. Property data is not seller intent. Sample screens use non-identifying addresses. Agents are responsible for their own compliance with broker, state, and federal rules on anything they send. Links: Privacy, Terms, Refunds, Data methodology.

### Variant B (billing gate not open on Oct 12)

- Primary CTA button: Request a Founding Agent invite (opens an inline form: name, email, brokerage, office town, NJ license number optional; submit fires `founding_invite_requested`).
- Secondary link: Create a free account (to `/free`, fires `free_account_created` on completion).
- Micro-line: Invite code, 30-day trial, limited to 100 New Jersey agents. No card needed to request an invite.
- Disclosure block replaced with: Founding Agent invites are limited to 100 New Jersey agents. Your invite code starts a 30-day trial of the Agent plan. No card is needed for the invite trial. When public enrollment opens, the Agent plan is $59 per month or $590 per year.
- FAQ question 1 replaced with: Q: When does paid enrollment open? A: We will email everyone who requested an invite the day it opens. Until then the invite trial runs 30 days.
- Everything else identical. Same file, same events, `variant=b`.

### Mobile requirements

- Works at 320, 390, 430, and 768 wide with no horizontal overflow at document level (the Playwright harness treats overflow as a hard failure).
- 16px side gutters. Body text 16px minimum, nothing under 12px anywhere including the disclosure and footer.
- Every tap target at least 44 by 44 px. Primary button full width on mobile, sticky bottom bar with the primary button after the visitor scrolls past the hero (hide it while the FAQ is open to avoid covering answers).
- The sample card renders as HTML, not an image, and reflows at 320.
- Respect `prefers-reduced-motion`. No autoplay video. No pop-ups, no exit-intent modal on this page.

### Page speed

- Largest Contentful Paint under 2.5 seconds on a throttled mobile connection; Interaction to Next Paint under 200 ms; Cumulative Layout Shift under 0.1.
- Total transfer under 600 KB on first load. Screenshots as WebP with explicit width and height, lazy-loaded below the fold. No web fonts beyond what the site already loads; system stack acceptable.
- Third-party tags load async and after first paint. Pixel and Insight Tag scripts must not block rendering.
- Verify with Lighthouse on mobile and a Playwright `targeted` run on `/agents/trial` and `/agents/trial/thanks` (320, 390, 430, 768, 1440, mobile WebKit) before Oct 12. Do not claim it is certified from source inspection.

### Tracking events on this page

| Event | Trigger | Parameters |
| --- | --- | --- |
| `view_landing` | Page render | `variant`, `utm_*` from `product-analytics.js` |
| `cta_click` | Any CTA click | `cta` (`trial`, `invite`, `free`), `position` (`hero`, `sticky`, `final`) |
| `checkout_started` | Checkout opens (existing event) | `plan=agent`, `cadence` |
| `trial_started` | Fired on the thank-you page from the checkout success return, deduplicated against the server event by `event_id` | `plan`, `cadence`, `variant` |
| `founding_invite_requested` | Invite form submitted | `variant`, `source_page` |
| `faq_open` | FAQ item expanded | `question` index |

Server-side: `trial_started` and `subscription_confirmed` fire from the Stripe webhook handler to GA4 Measurement Protocol and Meta Conversions API with the same `event_id` as the client event.

## 2. Improvement notes for the existing `/for/real-estate-agents`

Keep the hero: the headline "Walk into the conversation knowing the property." and the subhead are right. The rest of the page is written like a brochure, and it currently has no trial door. Changes, in priority order:

1. Add the trial CTA under the hero: primary "Start your 14-day Agent trial" to `/agents/trial`, secondary "Request a Founding Agent invite." Keep the Founding Lifetime block further down; it is one option, not the front door.
2. Replace the hero button text (currently "Get Started" plus "Agents Only", joined by a dash character and followed by an arrow glyph) with "Start your 14-day Agent trial." The dash character and the arrow are both out of voice.
3. The quote block: the approved quote "The property story is already there when I need it." attributed to "NJ real estate agent" may stay for now. Add a second quote slot with the placeholder "[Real quote from a Founding Agent, two sentences, no results claims]" attributed "[Agent name, Brokerage, Town]" and hide the slot until it is filled. When a real quote exists, it replaces the anonymous one.
4. Add capacity and price transparency near the Founding Lifetime block: "Agent plan: $59 per month or $590 per year. Monitor up to 25 properties. Postcards $1.79 per card, printing and postage included." Today the page shows $1,499 and $590 but never $59, and never the 25-property limit outside the Lifetime bullets.
5. Rewrite the four benefit lines in sentence case and plain words. "Impress clients with deeper property context" becomes "Answer the tax question with the record, not a guess." "Find opportunities others may miss" becomes "Know which past clients have a property reason to hear from you this week." "Real-time property insights" becomes "Source and date on every number."
6. Remove the exit-intent modal (the "BEFORE YOU GO" panel with the line "Same Intelligence. Your Way."). It is brochure copy, it interrupts mobile, and it competes with the trial door. If a year-end annual prompt is wanted, put it inline in Phase 3.
7. Replace the tagline "One payment. A lifetime of advantage." and "A More Informed New Jersey. A Stronger You." with plain lines: "One payment, lifetime Agent access, 25-property capacity" and "Built for New Jersey agents who want to know the property before the conversation starts."
8. The "Representative Agent Control view" screenshot: keep, add the word "Sample" visibly on the image and confirm the address shown is non-identifying.
9. Add the compliance footer line from section 1, item 9.
10. Confirm the page fires `view_landing` with `variant=agents-page` so it can be compared with `/agents/trial` in the weekly report. Run the Playwright `targeted` matrix after the edits.

## 3. Thank-you page: `/agents/trial/thanks`

Physical file `property/agents/trial/thanks/index.html`. `noindex`. Reached only after a completed trial start (Variant A) or invite request (Variant B); a direct visit with no session shows a plain "Start here" link back to `/agents/trial` and fires nothing.

### Content (Variant A, trial started)

- Headline: You're in. Here is the first 20 minutes.
- Line: Your trial runs 14 days. We will remind you 3 days before the first charge. Cancel in one click from Account at any time.
- Four numbered steps, each a button:
  1. Agent Academy, lesson 1 (about 8 minutes). Button: Start lesson 1, to `/agent/training`. Lesson completion fires `academy_lesson_1_done`.
  2. Add 5 past clients. Button: Open Clients, to Agent Desk Clients. Upload a CSV or type five addresses; Watchdog matches them to parcels.
  3. Draw a farm. Button: Open Farm map, to Agent Desk Farm.
  4. Book 15 minutes with John. Button: Pick a time, to [scheduler link placeholder, e.g., a Calendly or Google appointment page; confirm before launch]. Text: Bring one address you are working on.
- Below the steps: "Your Monday email starts next week once you have added at least one property."
- Footer: Reply to the welcome email with any question; it goes to John.

### Content (Variant B, invite requested)

- Headline: Invite requested. Here is what happens next.
- Line: We send invite codes in the order requests arrive, limited to 100 New Jersey agents. Watch for an email from Watchdog within [N] business days.
- Two buttons: Create a free account now (to `/free`) and Read the agent field guide (to `/real-estate-agents`).
- Optional: Book 15 minutes with John [scheduler placeholder].

### Tracking

- Fires `trial_started` (client) with `event_id` matching the server event, or `founding_invite_requested` for Variant B.
- Fires `thanks_step_click` with `step` 1 to 4.
- The Meta pixel `StartTrial` and LinkedIn Insight Tag conversion are attached to this URL (see `utm-and-tracking.md`).
- Page must not be reachable by guessing the URL without a session token or a checkout return parameter; otherwise bots inflate `trial_started`.
