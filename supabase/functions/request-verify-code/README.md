# Manual ownership-verification mailer with EmailJS

This version generates the six-character code securely, stores only a salted digest, and uses the EmailJS REST API to email the plain code and property mailing address to the site administrator. The administrator writes or prints the code on a postcard and mails it manually.

Deploy both SQL migrations in timestamp order, then deploy this Edge Function with JWT verification enabled.

Required Supabase Edge Function secrets:

- `EMAILJS_PRIVATE_KEY` - the EmailJS private key. Never put it in browser JavaScript or commit it to GitHub.
- `EMAILJS_PUBLIC_KEY` - defaults to the public key already used by the site.
- `EMAILJS_SERVICE_ID` - defaults to `service_gptqbyx`.
- `EMAILJS_TEMPLATE_ID` - defaults to `template_verifymail`.
- `VERIFY_ADMIN_EMAIL` - the administrator inbox receiving the code.
- `VERIFY_FROM_EMAIL` - the sender address configured in the EmailJS template/service.
- Standard Supabase secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.

The private key stays inside Supabase. The code is never returned to the browser, is rate-limited to three requests per user per day, and expires after 30 days. No owner name is requested or stored.
