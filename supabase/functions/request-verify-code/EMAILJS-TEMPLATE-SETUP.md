# EmailJS template_verifymail

Set the template recipient to `{{to_email}}` and use a subject such as:

`Mail Watchdog verification postcard: {{property_address}}, {{property_city}}`

Suggested template body:

```text
A Watchdog ownership-verification postcard was requested.

MAIL TO
{{full_mailing_address}}

VERIFICATION CODE
{{verification_code}}

Request ID: {{request_id}}
PAMS PIN: {{pams_pin}}
Expires: {{expires_date}}
Requester account: {{requester_email}}

{{instructions}}
```

Available variables are `to_email`, `from_email`, `property_address`, `property_city`, `property_state`, `property_zip`, `full_mailing_address`, `verification_code`, `request_id`, `pams_pin`, `expires_date`, `requester_email`, and `instructions`.

The template must send only to the administrator. Do not set the requester email as the recipient or CC address.
