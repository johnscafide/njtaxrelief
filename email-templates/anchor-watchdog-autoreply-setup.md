# ANCHOR estimator Watchdog auto-reply

Use `anchor-watchdog-autoreply.html` as the source of truth for the EmailJS auto-response associated with `template_contact`.

## Suggested subject

`Your NJ relief estimate + Watchdog property data for {{address}}`

## Variables already supplied by the estimator

- `{{name}}`
- `{{email}}`
- `{{address}}`

The template uses the submitted address to create a personalized Watchdog link:

`https://www.watchdogindex.com/?address={{address}}`

The browser will encode ordinary spaces and commas when the link is opened, and the Watchdog lookup will resolve the address on the destination page.

## Watchdog Score policy

Do not put an unconditional numeric Watchdog Score into this email yet.

The current estimator sends `template_contact` before the post-result Watchdog property match and canonical ROBUST score lookup completes. Production currently exposes scores only when sufficient canonical ROBUST-v1 evidence exists. The email therefore states that a score is shown on Watchdog only when supported and links directly to the submitted property.

A future numeric-score email enhancement should use the same canonical `get_public_realtime_watchdog_scores` path already used by the ANCHOR Watchdog results card, preserve `score_source`, and fall back to a non-numeric state when the score is unavailable. It must never substitute the estimator lead-intent score for the property Watchdog Score.

## Staleness guardrails

- Do not hard-code changing ANCHOR/PAS-1 deadlines in the auto-response.
- Link users to `propertytaxrelief.nj.gov` for current official forms, eligibility and deadlines.
- Keep the NJ Property Tax Relief + Watchdog co-branding.
- Keep the renter residence disclaimer so the property record does not imply ownership.
- Keep the Watchdog Score limitation language: it is research context, not an appraisal, legal conclusion, appeal determination or financial recommendation.
