# Professional review notification setup

Watchdog always places REALTOR® verification submissions in the Backoffice **Professional Reviews** queue. Email notification is an additional convenience and is not the source of truth.

## EmailJS template

Create an EmailJS template named `template_professional_review` or set `EMAILJS_PROFESSIONAL_REVIEW_TEMPLATE_ID` to another template ID.

Suggested subject:

`New Watchdog REALTOR® verification: {{agent_name}}`

Suggested body variables:

- `{{agent_name}}`
- `{{agent_email}}`
- `{{nar_member_id}}`
- `{{local_association}}`
- `{{proof_url}}`
- `{{user_note}}`
- `{{brokerage_name}}`
- `{{nj_license_number}}`
- `{{nj_license_status}}`
- `{{submitted_at}}`
- `{{backoffice_url}}`
- `{{instructions}}`

## Edge Function secrets

The function reuses existing EmailJS credentials where available:

- `EMAILJS_PRIVATE_KEY`
- `EMAILJS_PUBLIC_KEY`
- `EMAILJS_SERVICE_ID`

Optional professional-review-specific settings:

- `EMAILJS_PROFESSIONAL_REVIEW_TEMPLATE_ID` (defaults to `template_professional_review`)
- `PROFESSIONAL_REVIEW_ADMIN_EMAIL` (falls back to `VERIFY_ADMIN_EMAIL`)
- `PROFESSIONAL_REVIEW_FROM_EMAIL` (falls back to `VERIFY_FROM_EMAIL`)

If email is not configured or delivery fails, the submission remains visible in Backoffice and the outbox records the failure for operational review.
