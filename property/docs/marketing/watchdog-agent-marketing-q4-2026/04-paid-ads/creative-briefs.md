# Creative briefs: 12 static creatives, CR-01 to CR-12

Follows `00-brief/product-and-brand-brief.md`. These briefs are written so a designer, or an automated HTML renderer, can produce each creative exactly. Nothing here is open to interpretation except the two placeholders marked with brackets.

## Common specification (applies to all twelve)

- Sizes, every creative: 1080x1080 (Facebook and Instagram feed), 1080x1920 (Stories and Reels; keep the top 250 px and bottom 340 px free of text and logo), 1200x628 (link ads, LinkedIn single image, Google Display responsive). Export PNG, sRGB, under 1 MB each. File names `CR-01-1080x1080.png` and so on, saved under `04-paid-ads/creatives/`.
- Colors: Watchdog navy `#183b84` and white `#ffffff` only. Text on navy is white; text on white is navy. Sample-data cards on a navy background are white with navy text; on a white background they are white with a 2 px navy border. No other colors, no gradients. The Watchdog Intelligence spectrum treatment is not used on any of these creatives because none of them is a Watchdog Intelligence surface.
- Type: the site's UI font stack [confirm with Engineering; fallback Inter]. Headline 72 px at 1080 width (scale proportionally), supporting line 40 px, sample-card text 32 px minimum, small disclosure text 26 px minimum. Sentence case everywhere. No all-caps except the "SAMPLE" tag.
- Sample tag: every card that shows data carries a small rounded tag in the top-right corner reading "SAMPLE" (26 px, navy on white or white on navy). This is not optional.
- Logo: Watchdog wordmark [confirm asset path under `property/assets/`; do not redraw it]. Placement is stated per creative. Minimum height 40 px at 1080 width.
- CTA: rendered as a solid button (navy on white backgrounds, white on navy), 56 px tall at 1080 width, text 32 px. Button text is stated per creative.
- Never: photos of houses with people, families, neighborhood lifestyle shots, stock photos of agents, emojis, exclamation marks, em dashes, arrows as decoration. The only photograph allowed in the set is John's headshot on CR-12.
- Addresses: 123 Example Street, Sample Town, NJ. No real town names on any creative. Real figures allowed: 564 municipalities, 131,244 SR1A verified sales, 55.2% statewide median assessment-to-market ratio, prices from the brief. Every other number is a sample and is labeled.
- Accessibility: contrast ratio 4.5:1 or better everywhere (navy on white and white on navy both pass). Alt text for each creative is the headline plus the supporting line.

## CR-01: Walk in knowing
- Background: navy `#183b84`
- Headline: Know the property before you walk in
- Supporting line: One view. Assessment, taxes, permits, sales. Source on every number.
- Sample data element: white card, "123 Example Street, Sample Town, NJ" as the card title, then four rows: "Assessment: up 11.4% since 2024. Source: MOD-IV, Aug 2026" / "Town reassessment: completed 2025" / "Permit: deck, closed May 2026" / "Nearest verified sale: Jun 2026 (SR1A)". SAMPLE tag top-right.
- CTA text: Start your 14-day Agent trial (Phase 0 version: Look up a property free)
- Logo placement: bottom-left, white wordmark
- Layout: headline top-left, card center-right, supporting line under the headline, CTA bottom-right above the logo line. Stories version stacks headline, card, CTA vertically.

## CR-02: Tax bill translator
- Background: white `#ffffff`
- Headline: Why did the tax bill move?
- Supporting line: Rate, assessment, or ratio. Side by side, with the source.
- Sample data element: three small bordered cards in a row: "Tax rate, 2025 to 2026: +2.1%" / "Assessment: unchanged" / "Town ratio: 48.9%". Under the row, one line: "Source: county tax board and MOD-IV, 2026. Statewide median ratio 55.2%." SAMPLE tag on the row.
- CTA text: Start your 14-day Agent trial (Phase 0 version: Read the agent field guide)
- Logo placement: top-left, navy wordmark
- Variant for AD-M-021 and AD-L-005: add a navy band across the top reading "Added assessment appeals: due Dec 1" in white, 40 px.

## CR-03: The Monday desk
- Background: navy `#183b84`
- Headline: A real reason to reach out
- Supporting line: Which past clients have a property reason to hear from you this week.
- Sample data element: white card styled as Opportunity Desk. Header row: "Now (1)   This week (2)   Watch (3)". Then one expanded card: "123 Example Street. Town reassessment announced. Confidence: High. Source: municipal notice, Sep 2026. Next action: send the note, offer a ten-minute call." Two collapsed rows under it: "Assessment above peer band. Aug 2026" / "Deck permit closed. May 2026". SAMPLE tag top-right.
- CTA text: Start your 14-day Agent trial (LinkedIn form version: Book a lunch-and-learn)
- Logo placement: bottom-left, white wordmark
- Variant for AD-M-020: a quote strip above the CTA reading "[Real quote]" and "[Agent name, Brokerage, Town]"; do not render until the quote is real.

## CR-04: Postcards at $1.79
- Background: white `#ffffff`
- Headline: Farm postcards, $1.79 per card
- Supporting line: Printing and postage included. Minimum 50 addresses. Mailed First Class.
- Sample data element: a 6 x 8.5 postcard mock at an angle, front face reading "Your town is reassessing for 2027. Here is what the record shows for this street." with a small navy footer "[Agent name], [Brokerage], [broker-required disclosure]". Address block on the back corner: "Current Resident, 123 Example Street, Sample Town, NJ". SAMPLE tag on the postcard.
- CTA text: Start your 14-day Agent trial
- Logo placement: top-left, navy wordmark
- Holiday variant for AD-M-022: postcard front reads "Happy holidays from [Agent name]. One useful thing: 2027 assessment notices arrive around Feb 1."

## CR-05: New Jersey deep vs national wide
- Background: navy `#183b84`
- Headline: New Jersey deep, not national wide
- Supporting line: 564 municipalities. Chapter 123. Revaluations. Verified sales. Source attached.
- Sample data element: two white columns. Left header "National tool": rows "50 states" / "One depth" / "Owner lists sold". Right header "Watchdog": rows "564 NJ municipalities" / "131,244 verified sales" / "Chapter 123 ratio, every town" / "No owner lists sold". Under the columns: "Watchdog figures as of Aug 2026." No SAMPLE tag on this one because the Watchdog figures are real; instead a small line "Left column describes a category, not a named product."
- CTA text: Start your 14-day Agent trial (AD-M-023 version: Compare the job, not the bill)
- Logo placement: bottom-left, white wordmark

## CR-06: Founding Agent, 100 seats
- Background: navy `#183b84`
- Headline: 100 Founding Agent seats
- Supporting line: New Jersey agents only. Invite code. Direct line to the founder.
- Sample data element: a white counter card reading "Seats claimed: [N] of 100" with a thin progress bar. [N] is the real count; the Coordinator re-renders this card every Tuesday. Until launch the card reads "Seats claimed: 0 of 100". No SAMPLE tag; this figure must be real whenever it shows.
- CTA text: Request a Founding Agent invite
- Logo placement: bottom-left, white wordmark
- Small text under the CTA (26 px): "Same Agent plan, $59 per month or $590 per year, when you decide to stay."

## CR-07: 14-day trial
- Background: white `#ffffff`
- Headline: Start your 14-day Agent trial
- Supporting line: Everything on the Agent plan. Cancel in one click before day 14.
- Sample data element: a bordered checklist card with six rows and check marks (plain tick glyph, navy): "Agent Desk" / "Opportunity Desk, weekly" / "Watchdog Score, 0 to 100" / "Monitor up to 25 properties" / "Postcard Studio, $1.79 per card" / "Agent Academy, 8 lessons". No SAMPLE tag (no data).
- On-image small text, required, 26 px, under the CTA: "Card required. $59 per month after day 14 unless cancelled. Reminder 3 days before the first charge."
- CTA text: Start your 14-day Agent trial
- Logo placement: top-left, navy wordmark
- Stories version: the small text sits directly above the bottom safe zone, never inside it.

## CR-08: Year-end annual plan, $590
- Background: navy `#183b84`
- Headline: $590 a year. Expense it in 2026.
- Supporting line: Ten monthly payments for twelve months. Pay before Dec 31.
- Sample data element: a white receipt-style card: "Agent annual plan" / "$590, billed once" / "Renews in 12 months" / "Cancel from Account" / "Date: Dec [dd], 2026". SAMPLE tag top-right (it is a representative receipt, not a real one).
- Small text under the CTA (26 px): "How you treat the expense is a question for your accountant."
- CTA text: Choose annual
- Logo placement: bottom-left, white wordmark

## CR-09: Triple Play meetup, Dec 7 to 10
- Background: navy `#183b84`
- Headline: Find John at Triple Play
- Supporting line: Dec 7 to 10, Atlantic City. Bring an address, see the property story.
- Sample data element: a white card with a simple map-pin glyph and "Atlantic City Convention Center, [Booth number or meeting spot]" and, beneath it, a mini property row "123 Example Street. Watchdog Score 72. SAMPLE".
- CTA text: Bring an address (post-event version for AD-M-036: Start your 14-day Agent trial)
- Logo placement: bottom-left, white wordmark
- Post-event variant: headline becomes "From the Triple Play floor" and the pin card is replaced by the CR-01 sample card.

## CR-10: The Watchdog Score, powered by the ROBUST Framework
- Background: white `#ffffff`
- Headline: The Watchdog Score, 0 to 100
- Supporting line: Powered by the ROBUST Framework. Evidence beside the number.
- Sample data element: left, a large ring with "72" in the center and "123 Example Street" under it. Right, six rows with a short bar each: "R  Recourse  70" / "O  Overassessment Position  68" / "B  Burden  74" / "U  Uniformity  62" / "S  Stability  81" / "T  Trajectory  77". Under the rows: "Source: MOD-IV, county ratio tables, SR1A. Aug 2026." SAMPLE tag top-right.
- CTA text: Start your 14-day Agent trial (Phase 0 version: Look up a property free)
- Logo placement: top-left, navy wordmark
- Never pair the word ROBUST directly with the word Score on this creative; the only phrase is the Watchdog Score, powered by the ROBUST Framework.

## CR-11: Town Compare
- Background: navy `#183b84`
- Headline: Compare two NJ towns side by side
- Supporting line: Effective tax rate, assessment ratio, revaluation status. Source year on each.
- Sample data element: two white columns. "Sample Town A": "Effective tax rate 2.41%" / "Assessment ratio 51.3%" / "Revaluation completed 2025". "Sample Town B": "Effective tax rate 1.98%" / "Assessment ratio 88.7%" / "Last revaluation 2014". Under both: "Source: 2026 tax rate and ratio tables." SAMPLE tag across the top of the pair. Neither column is styled as better; same weight, same color.
- CTA text: Compare two towns free (Phase 2 version: Start your 14-day Agent trial)
- Logo placement: bottom-left, white wordmark

## CR-12: Founder note from John
- Background: white `#ffffff`
- Headline: A note from John
- Supporting line: I built Watchdog because agents asked for the property story first.
- Sample data element: none. In its place, a plain text block in 36 px navy, left-aligned, reading: "Every number has its source and date. The Agent plan is $59 per month. Try it for 14 days; if it is not useful, cancel in one click and pay nothing." Signed "John Scafide, founder. @thetaxwatchdog".
- Photograph: John's headshot [confirm asset; must be a real photo of John, not stock], 320 px circle at 1080 width, top-right. Plain background behind him.
- CTA text: Start your 14-day Agent trial
- Logo placement: bottom-left, navy wordmark
- Small text under the CTA (26 px): "Card required. $59 per month after day 14 unless cancelled."

## Production and approval

- Order of delivery (dates in `calendar-feed-paid.csv`): Oct 2, CR-01, CR-02, CR-10, CR-11, CR-12. Oct 7, CR-03 to CR-07. Oct 16, CR-08, CR-09. Nov 20, CR-09 final with the booth filled.
- John approves each creative against this brief and the brand rules before it is uploaded. Check: no em dash, no exclamation mark, no emoji, sentence case, SAMPLE tag present where data is shown, prices only from the brief, no town names, ROBUST never paired directly with Score.
- Each creative is exported in the three sizes plus a 300x250 and 320x50 crop of CR-01 and CR-07 for Google Display.
