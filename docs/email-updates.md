# Email updates (in partnership with Kit)

Clean URL: `https://www.watchdogindex.com/newsletter-studio`
(physical file: `property/newsletter-studio/index.html`). Agent Desk links to it as "Email updates".

One page, five steps: connect Kit → who gets it → write it (live preview) → send it → sent and scheduled.
Open to Agent plans and up. Accounts on `marketing_email_beta_access` keep access on any plan.

## Pieces

| Piece | What it does |
| --- | --- |
| `property/newsletter-studio/index.html` | Page structure, every word on the page, and the seven starter emails (`#eu-starter-copy`). |
| `property/js/email-updates.js` | Fills in data, builds the email as email-safe HTML (tables, inline styles, escaped text, https-only links and images), live preview in a sandboxed iframe, unsent draft kept in the browser. |
| `property/css/email-updates.css` | Board design matching Postcard Studio. |
| `supabase/functions/tmp-boldtrail-probe` | The Kit gateway (slug kept because production is at the function-count cap). Holds the agent's Kit V4 key server-side and makes every Kit call. |

## Gateway actions

| Action | Kit call |
| --- | --- |
| `email.status` | none. Connection, senders, CRM match counts, signature details (brand profile + profile photo and agent page, never the login email) and the last 20 broadcasts. |
| `kit.connect` / `kit.health` / `kit.disconnect` | `GET /account` |
| `kit.catalog` | `GET /tags`, `GET /segments` |
| `kit.audience` | `GET /subscribers?status=active&include_total_count=true` or `GET /tags/{id}/subscribers?...`; segments are not counted |
| `sender.save` | none |
| `kit.reconcile_existing` | `GET /subscribers` (matches CRM contacts already in Kit; never uploads anyone) |
| `broadcast.create` | `POST /broadcasts` (draft, or scheduled with `send_at`) |
| `broadcast.refresh` | `GET /broadcasts/{id}/stats` for up to 10 recent sends |
| `broadcast.cancel` | `DELETE /broadcasts/{id}`, only for drafts or scheduled emails more than 30 seconds out |

## Sending rules

- "Send now" schedules the email 3 minutes out, so it can still be canceled.
- The server refuses a scheduled send without `confirm_send`, and a send to everyone without `confirm_all_subscribers`.
  The page sets them only after the consent checkbox and, for everyone, a confirmation.
- Kit adds the unsubscribe link and mailing address. The greeting uses Kit's merge tag
  `{{ subscriber.first_name | default: "there" }}`.
- The town tax snapshot uses `/tax-rates.json` and `/equalization-ratios.json` (NJ Division of Taxation).
