# Manual ownership-verification mailer

This version does not use PostGrid. It generates the six-character code securely, stores only a salted digest, and emails the plain code and property mailing address to the site administrator. The administrator writes or prints the code on a postcard and mails it manually.

Deploy `20260805180000_ownership_verification.sql`, then deploy this Edge Function with JWT verification enabled.

Required secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `VERIFY_ADMIN_EMAIL`, and `VERIFY_FROM_EMAIL`.

`VERIFY_ADMIN_EMAIL` is where the mailing instructions and code are delivered. `VERIFY_FROM_EMAIL` must be a sender authorized in Resend. The code is never returned to the browser, is rate-limited to three requests per user per day, and expires after 30 days. No owner name is requested or stored.
