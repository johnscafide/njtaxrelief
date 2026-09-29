# UTM and tracking: Watchdog Agent plan, Q4 2026

Follows `00-brief/product-and-brand-brief.md`. Every paid or tracked link in this plan carries the pattern from the brief: `?utm_source=<channel>&utm_medium=<type>&utm_campaign=q4-agents-<phase>&utm_content=<asset-id>`. This file is the dictionary every other folder uses, plus the event map for GA4, Meta, Google Ads, and LinkedIn, and the weekly report template.

What already exists on the site: GA4 property G-ENP9182L0J and Microsoft Clarity are injected site-wide by the routing adapter (`api/watchdog-index-entry.js`). `property/js/product-analytics.js` captures first-touch and session-level UTMs (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`), the landing path, and the referrer, and sends them with every product event it knows about; it already has `page_view`, `checkout_started`, `subscription_confirmed`, `upgrade_cta_clicked`, and `property_lookup_started`. It honors Global Privacy Control and Do Not Track. There is no Meta pixel and no LinkedIn Insight Tag on the site today.

## 1. UTM dictionary

All values lowercase. Hyphens, not underscores or spaces. Asset IDs are lowercased in URLs so GA4 does not split rows by case (`AD-M-007` becomes `ad-m-007`); the uppercase ID remains the name in every document.

| Parameter | Allowed values (paid) | Notes |
| --- | --- | --- |
| `utm_source` | `meta`, `google`, `linkedin`, `youtube` | Meta covers Facebook and Instagram; placement is read from the platform, not the UTM. Retargeting keeps the platform as source. |
| `utm_medium` | `paid-social` (Meta, LinkedIn), `cpc` (Google Search), `video` (YouTube), `retargeting` (any retargeting ad set, Meta or Google) | Retargeting gets its own medium so the weekly report can split it without a platform export. |
| `utm_campaign` | `q4-agents-0`, `q4-agents-1`, `q4-agents-2`, `q4-agents-3` | Phase boundaries: p0 Sep 28 to Oct 11, p1 Oct 12 to Nov 1, p2 Nov 2 to Dec 6, p3 Dec 7 to Dec 31. Campaigns are renamed and URLs updated at each boundary (rows in `calendar-feed-paid.csv`). |
| `utm_content` | Asset ID, lowercase: `ad-m-001` to `ad-m-036`, `ad-g-brand`, `ad-g-intent`, `ad-g-comp`, `ad-g-tools`, `ad-g-town`, `ad-g-tp`, `ad-l-001` to `ad-l-008`, `ad-y-001` to `ad-y-006`, `ad-r-001` to `ad-r-012`, `q4-lnl-form` | One ad, one ID. If the same ad runs in two ad sets, the ad set is read from the platform. |
| `utm_term` | `{keyword}` on Google Search only | Set through the tracking template; leave empty everywhere else. |

Other folders (social, email, SMS, outreach, print, events, referral) use the same pattern with their own `utm_source` and `utm_medium` values (for example `tiktok` and `organic-social`, `email` and `newsletter`, `postcard` and `print`); the campaign and content rules above apply to them unchanged.

Rules:
- Never send a paid click to a URL without UTMs. Never send one to a `/property/...` path.
- Google Ads auto-tagging (`gclid`) stays on alongside UTMs. Meta's URL parameters field carries the UTMs; do not use dynamic `{{ad.id}}` in place of the asset ID, add it as a fifth parameter `mid={{ad.id}}` if wanted.
- Do not put UTMs on internal links inside the site; they overwrite the session source.
- Shortened links (for print or spoken URLs) must expand to a fully tagged URL.

## 2. Example table (20 rows)

| # | Asset | Full URL |
| --- | --- | --- |
| 1 | AD-M-001 | `https://www.watchdogindex.com/free?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-0&utm_content=ad-m-001` |
| 2 | AD-M-003 | `https://www.watchdogindex.com/real-estate-agents?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-0&utm_content=ad-m-003` |
| 3 | AD-M-005 | `https://www.watchdogindex.com/town-compare?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-0&utm_content=ad-m-005` |
| 4 | AD-M-006 | `https://www.watchdogindex.com/beta?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-0&utm_content=ad-m-006` |
| 5 | AD-M-007 | `https://www.watchdogindex.com/agents/trial?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-1&utm_content=ad-m-007` |
| 6 | AD-M-015 | `https://www.watchdogindex.com/agents/trial?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-1&utm_content=ad-m-015` |
| 7 | AD-M-023 | `https://www.watchdogindex.com/pricing/propstream?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-2&utm_content=ad-m-023` |
| 8 | AD-M-031 | `https://www.watchdogindex.com/pro?utm_source=meta&utm_medium=paid-social&utm_campaign=q4-agents-3&utm_content=ad-m-031` |
| 9 | AD-G-BRAND | `https://www.watchdogindex.com/agents/trial?utm_source=google&utm_medium=cpc&utm_campaign=q4-agents-1&utm_content=ad-g-brand&utm_term={keyword}` |
| 10 | AD-G-INTENT | `https://www.watchdogindex.com/agents/trial?utm_source=google&utm_medium=cpc&utm_campaign=q4-agents-1&utm_content=ad-g-intent&utm_term={keyword}` |
| 11 | AD-G-COMP | `https://www.watchdogindex.com/pricing/propstream?utm_source=google&utm_medium=cpc&utm_campaign=q4-agents-1&utm_content=ad-g-comp&utm_term={keyword}` |
| 12 | AD-G-TOWN | `https://www.watchdogindex.com/town-compare?utm_source=google&utm_medium=cpc&utm_campaign=q4-agents-2&utm_content=ad-g-town&utm_term={keyword}` |
| 13 | AD-G-TP | `https://www.watchdogindex.com/agents/trial?utm_source=google&utm_medium=cpc&utm_campaign=q4-agents-3&utm_content=ad-g-tp&utm_term={keyword}` |
| 14 | AD-L-003 | `https://www.watchdogindex.com/real-estate-agents?utm_source=linkedin&utm_medium=paid-social&utm_campaign=q4-agents-0&utm_content=ad-l-003` |
| 15 | AD-L-007 | `https://www.watchdogindex.com/agents/trial?utm_source=linkedin&utm_medium=paid-social&utm_campaign=q4-agents-1&utm_content=ad-l-007` |
| 16 | Q4-LNL-FORM thank-you | `https://www.watchdogindex.com/real-estate-agents?utm_source=linkedin&utm_medium=paid-social&utm_campaign=q4-agents-1&utm_content=q4-lnl-form` |
| 17 | AD-Y-004 end card | `https://www.watchdogindex.com/agents/trial?utm_source=youtube&utm_medium=video&utm_campaign=q4-agents-1&utm_content=ad-y-004` |
| 18 | AD-R-005 | `https://www.watchdogindex.com/agents/trial?utm_source=meta&utm_medium=retargeting&utm_campaign=q4-agents-1&utm_content=ad-r-005` |
| 19 | AD-R-011 | `https://www.watchdogindex.com/pro?utm_source=meta&utm_medium=retargeting&utm_campaign=q4-agents-3&utm_content=ad-r-011` |
| 20 | AD-R-001 (Google Display) | `https://www.watchdogindex.com/agents/trial?utm_source=google&utm_medium=retargeting&utm_campaign=q4-agents-1&utm_content=ad-r-001` |

## 3. GA4 events

Add these to the `EVENTS` set in `property/js/product-analytics.js` so they carry the UTM touch data, and send each to GA4 through `gtag('event', ...)` with the parameters shown. Mark the ones flagged as key events in GA4 Admin.

| Event | Key event | Parameters | Fires from |
| --- | --- | --- | --- |
| `view_landing` | no | `variant`, `page` | `/agents/trial` (and `/for/real-estate-agents` with `variant=agents-page`) |
| `cta_click` | no | `cta`, `position` | Landing pages |
| `checkout_started` (existing) | yes, secondary | `plan`, `cadence` | Checkout open |
| `trial_started` | yes, primary | `plan`, `cadence`, `variant`, `event_id` | Thank-you page (client) and Stripe webhook via Measurement Protocol (server); deduplicate on `event_id` |
| `founding_invite_requested` | yes, primary on Variant B | `variant`, `source_page`, `event_id` | Invite form submit, `/beta` |
| `free_account_created` | yes, secondary | `source_page` | `/free` completion |
| `academy_lesson_1_done` | yes, secondary | `lesson=1` | `/agent/training` |
| `subscription_confirmed` (existing) | yes, secondary, with value | `plan`, `cadence`, `value` (59 or 590), `currency=USD` | Stripe webhook |
| `thanks_step_click` | no | `step` | Thank-you page |
| `faq_open` | no | `question` | Landing page |

Do not use GA4's built-in form-submission recommended event for the invite request; keep the custom name so the report reads plainly.

GA4 audiences to build (they feed Google Ads remarketing and the Display and YouTube pools): agent-page visitors 30 days (URL allowlist from `retargeting.md`), landing non-converters, checkout abandoners, converters (`trial_started` 180 days, `subscription_confirmed` 365 days).

## 4. Meta pixel and Conversions API

Install: pixel base code injected by the routing adapter next to GA4, loaded async. Conversions API from the server that handles the Stripe webhook (the Supabase edge function), using the same `event_id` as the browser event for deduplication. Capture `_fbp` and `_fbc` on the landing page and pass them through checkout metadata so the server event matches.

| Site event | Meta event | Parameters |
| --- | --- | --- |
| `view_landing` | `ViewContent` | `content_name=agents-trial`, `content_category=agent-plan`, `variant` |
| `checkout_started` | `InitiateCheckout` | `content_name=agent-plan`, `currency=USD`, `value=0` |
| `trial_started` | `StartTrial` | `currency=USD`, `value=0`, `predicted_ltv=59`, `event_id` |
| `founding_invite_requested` | custom `FoundingInviteRequested` | `variant`, `event_id` |
| `free_account_created` | `CompleteRegistration` | `content_name=free` |
| `academy_lesson_1_done` | custom `AcademyLesson1Done` | none |
| `subscription_confirmed` | `Subscribe` | `currency=USD`, `value=59` or `590`, `event_id` |

Do not map the invite request to Meta's standard form-submission event; use the custom event above so the name stays plain in reports. Send hashed email only (no phone unless the person gave one with consent). Respect Global Privacy Control and Do Not Track exactly as `product-analytics.js` does: if either is set, the pixel does not load. Verify every event in Events Manager on Oct 2 with the test-events tool, and confirm deduplication shows "Deduplicated" for `StartTrial`.

## 5. Google Ads conversion import from GA4

1. Link the GA4 property to the Google Ads account (GA4 Admin, Product links). Enable auto-tagging in Google Ads.
2. Mark the key events in section 3. Import them into Google Ads as conversion actions:
   - `trial_started`: primary, counted once per click, 30-day click window, 1-day view window, value 0 (Variant A).
   - `founding_invite_requested`: primary on Variant B, secondary on Variant A.
   - `checkout_started`, `free_account_created`, `academy_lesson_1_done`: secondary (observation only).
   - `subscription_confirmed`: secondary with value, used for reporting revenue by keyword.
3. Attribution: data-driven if the account qualifies, otherwise last click. Do not switch attribution models mid-quarter.
4. Enhanced conversions: optional; if enabled, hashed email only, passed from the thank-you page.
5. Verify on Oct 5 that Google Ads shows the five imported actions with status "Recording conversions" before any Search budget is raised on Oct 12.

## 6. LinkedIn Insight Tag

- Create the partner ID in Campaign Manager [create]. Inject the tag through the routing adapter next to GA4 so every Watchdog page loads it (agent and homeowner pages alike; the audiences below are URL-scoped).
- Conversion rules: (a) URL-based, `/agents/trial/thanks` load, named `trial_started`, 30-day post-click; (b) event-specific via `lintrk('track', {conversion_id: [id]})` on `founding_invite_requested`; (c) the native form completion, tracked by LinkedIn automatically.
- Matched audiences: website visitors on the agent URL allowlist (30 and 90 days), and the customer exclusion list uploaded weekly.
- The tag also feeds the "Website demographics" report, which is the only place we can see job titles of visitors; read it monthly, never use it for anything other than checking that the traffic is agents and brokers.

## 7. Microsoft Clarity

Already installed. Use it for session recordings of `/agents/trial` in the first two weeks of Phase 1 (filter by URL) to see where people stop. Mask the checkout and invite form fields. Do not use Clarity data in any ad platform.

## 8. Data handling rules

- Hash emails (SHA-256, lowercased, trimmed) before any audience upload. Never upload phone numbers without consent to be contacted by text.
- Exclusion lists refresh every Monday from a Supabase export of paying accounts and trial accounts; the export contains email only.
- No ad platform receives property addresses, client lists, or anything an agent uploaded.
- Keep a one-page record of which platforms hold which lists and when they were last refreshed, in the weekly report.

## 9. Weekly reporting template

Filed every Tuesday by 12:00 after the 09:00 paid review, for the prior Monday-to-Sunday week. One table, plus decisions.

| Channel | Spend | Impressions | Clicks | CPC | Landing views | Trial starts | Cost per trial | Invite requests | Free accounts | Lesson 1 done | Paid conversions | CAC | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Meta prospecting | | | | | | | | | | | | | |
| Google Search | | | | | | | | | | | | | |
| LinkedIn | | | | | | | | | | | | | form completions and bookings in Notes |
| YouTube | | | | | | | | | | | | | views and view rate in Notes |
| Retargeting | | | | | | | | | | | | | frequency in Notes |
| Total | | | | | | | | | | | | | |

Definitions: Landing views from GA4 `view_landing` by `utm_source` and `utm_medium`. Trial starts from GA4 `trial_started`, cross-checked against Stripe. Paid conversions from `subscription_confirmed` by first-touch UTM (from `product-analytics.js`), reported with a lag: a trial that starts this week converts two weeks later, so the CAC column for the current week is blank until then. CAC is spend divided by paid conversions on the cohort that started in the same week.

Below the table, every week:
- Kill and scale decisions taken, by ad set or ad group, with the rule that triggered each.
- Creative refresh status and the next refresh date.
- Founding Agent seat count (real number) and the [N] used in AD-M-025 and AD-M-035.
- Any Meta flag or Google disapproval and the appeal result.
- Pool sizes for the five retargeting pools.
- Week-2 win criteria check (Oct 27 report only) against `paid-media-strategy.md`, section 7.
- Budget pacing against `budget-and-pacing.csv` for the tier in use, with any reallocation written into the CSV.
