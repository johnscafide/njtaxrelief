# Watchdog ad tracking setup

**Status (2026-10-01):** built and switched off. No ad platform ID is filled in, so no ad pixel loads, the cookie banner is unchanged, and Google's ad consent signals stay denied.

## What is built

| Piece | File | What it does |
| --- | --- | --- |
| Ad platform IDs | `property/js/watchdog-consent.js` (`AD_PIXELS` block) | One place for every ad platform ID. Blank means that platform never loads. |
| Consent choice | `property/js/watchdog-consent.js` | Once at least one ID is filled in, the cookie banner and Cookie settings add an **Advertising cookies** choice. It is off by default, "Reject optional cookies" turns it off, and a browser Global Privacy Control or Do Not Track signal keeps it off. Existing visitors are asked again once, because their earlier choice did not cover advertising. Google Consent Mode `ad_storage`, `ad_user_data` and `ad_personalization` are granted only for visitors who opt in. |
| Pixel runtime | `property/js/watchdog-ad-pixels.js` | Loads only on WatchdogIndex, only after the advertising opt-in. Loads each configured platform's base code and sends conversions. Sends no email, name, phone or property data. |
| Guardrail | `property/tests/ad-pixels-contract.mjs` + `.github/workflows/ad-pixels-contract.yml` | Fails if any ID is filled in while the Privacy Policy has no Advertising section naming that platform, or if the opt-in, GPC or host checks are removed. |

NJPropertyTaxRelief.com is not affected: the runtime and the advertising choice only exist on `www.watchdogindex.com`.

## Platforms and conversions

| Watchdog conversion | Fires when | Meta | Google Ads | LinkedIn | TikTok | Microsoft | Reddit | Pinterest | Snapchat | X |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `view_landing` | `/pro`, `/agents/trial`, `/real-estate-agents`, `/agents`, `/agent`, `/pricing` page view | ViewContent | (page view) | (page view) | ViewContent | event | ViewContent | (page view) | VIEW_CONTENT | (page view) |
| `lead` | Plan question form sent (`pro_demo_success`), Founding Agent invite request | Lead | label | id | SubmitForm | event | Lead | lead | CUSTOM_EVENT_1 | event id |
| `sign_up` | First sign-in within 2 hours of account creation | CompleteRegistration | label | id | CompleteRegistration | event | SignUp | signup | SIGN_UP | event id |
| `checkout_started` | Plan button click, Lifetime checkout start, trial checkout start | InitiateCheckout | label | id | InitiateCheckout | event | Custom: CheckoutStarted | (none) | START_CHECKOUT | event id |
| `trial_started` | `/agents/trial/thanks?session_id=…` or `/account?checkout=success&trial=1&session_id=…` | StartTrial | label | id | Subscribe | event | Custom: TrialStarted | signup | START_TRIAL | event id |
| `subscribe` | `/account?checkout=success&session_id=…` (no `trial=1`) | Subscribe | label | id | CompletePayment | event | Purchase | checkout | SUBSCRIBE | event id |
| `purchase` | Founding Lifetime purchase verified | Purchase (value) | label | id | CompletePayment | event | Purchase | checkout | PURCHASE | event id |

"label", "id" and "event id" mean the conversion is sent only when you fill in that platform's label or ID for it in `AD_PIXELS`. Nextdoor loads its base pixel and page views; set its conversions as URL rules in Nextdoor Ads Manager (for example `/agents/trial/thanks` and `/account?checkout=success`).

The X and Nextdoor base code in the runtime should be checked against the snippet each dashboard shows when you create the pixel. Meta, Google, LinkedIn, TikTok, Microsoft, Reddit, Pinterest and Snapchat use their standard published base code.

Conversions that arrive twice (a GA4 event and its Stripe return URL) are sent once, keyed on the Stripe checkout session id.

## Turning it on

Do these in order.

1. **Create the pixels and copy the IDs.** Menu names move around; these are the usual places.
   - Meta: Events Manager → Connect data sources → Web → copy the dataset (pixel) ID.
   - Google Ads: Goals → Conversions → New conversion action → Website → "Install the tag yourself" shows the `AW-…` conversion ID and a label for each action. Create one action per Watchdog conversion you want to bid on.
   - LinkedIn: Campaign Manager → Analyze → Insight Tag gives the partner ID; Conversion tracking → Create conversion (event-specific) gives each conversion ID.
   - TikTok: Ads Manager → Tools → Events → Web events → set up a pixel → copy the pixel ID.
   - Microsoft Advertising: Tools → UET tag → create → copy the tag ID.
   - Reddit: Ads → Events Manager → copy the pixel ID.
   - Pinterest: Ads → Conversions → copy the tag ID.
   - Snapchat: Ads Manager → Events Manager → copy the pixel ID.
   - X: Ads → Tools → Events Manager → Add event source → copy the pixel ID; each conversion event you create has its own event ID (`tw-…-…`).
   - Nextdoor: Ads Manager → Assets → Pixels → copy the pixel ID.
2. **Publish the Privacy Policy Advertising section** (draft below) on `property/privacy/index.html`, naming every platform you will turn on, with `id="advertising"`. Have counsel look at it with the rest of the legal review.
3. **Send the notice.** Privacy Policy section 16 promises account holders an email and a site notice *before* a new sharing party takes effect. Send it, then wait the notice period you choose.
4. **Fill in the IDs** in the `AD_PIXELS` block of `property/js/watchdog-consent.js` and run `node property/tests/ad-pixels-contract.mjs`. It must pass.
5. **Verify** with each platform's test tool (Meta Events Manager test events, Google Tag Assistant, LinkedIn Insight Tag status, TikTok Pixel Helper, Microsoft UET Tag Helper, Reddit Pixel Helper, Pinterest Tag Helper, Snap Pixel Helper). Accept advertising cookies first; nothing loads without it.
6. Run the Playwright `targeted` matrix on `/pro`, `/agents/trial` and `/account` so the banner change is checked at 320 to 1440 px.

## Google Ads without labels

Google Ads can also count conversions by importing GA4 key events (GA4 Admin → Product links → Google Ads, then mark `trial_started`, `founding_invite_requested`, `checkout_started` and `subscription_confirmed` as key events and import them). That needs no code, and works alongside the labels above.

## Not built yet: server-side conversions

Browser pixels miss people who block them. Each platform also has a server API (Meta Conversions API, Google Ads offline/enhanced conversions, TikTok Events API, LinkedIn Conversions API, Reddit Conversions API) that can send trial and purchase events from Stripe's webhook with the same event id for de-duplication. That needs an access token per platform stored as a Supabase secret, and a change to the billing webhook, so it is a separate, reviewed change.

## Draft Privacy Policy text (publish before step 4)

Add to the table in section 6, one row per platform you turn on:

> | Meta, Google Ads, LinkedIn, TikTok, Microsoft Advertising, Reddit, Pinterest, Snapchat, X (Twitter), Nextdoor | Only if you turn on Advertising cookies: ad measurement and showing you Watchdog ads on their services. They receive pages you visit on Watchdog, the conversion events listed in "Advertising cookies" below, and cookie or device identifiers they set. We do not send them your email, name, phone number, saved properties or profile. |

Add a new section with `id="advertising"`:

> **Advertising cookies.** Advertising cookies are off unless you turn them on in Cookie settings. If you turn them on, the ad platforms named in section 6 can measure whether Watchdog ads led to a visit, sign-up, trial or purchase, and can use that activity to show you Watchdog ads on their services. Under New Jersey law that may count as targeted advertising. You can turn advertising cookies off at any time in Cookie settings. If your browser sends a Global Privacy Control or Do Not Track signal, advertising cookies stay off. Each platform's own privacy policy governs what it does with the data it receives.

Then review section 7 ("What we do not do") and the cookie section with counsel so they match: the profile is still never used for advertising, but site activity is shared with ad platforms for visitors who opt in.
