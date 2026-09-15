# EmailJS template: `template_anchor_review`

Use this template for the automated Watchdog ANCHOR / Property Tax Relief review request.

## EmailJS settings

- **Template ID:** `template_anchor_review`
- **To Email:** `{{to_email}}`
- **Subject:** `{{subject}}`
- **Reply-To:** use the normal Watchdog support/reply address configured for the EmailJS service.
- **Content type:** HTML

The worker supplies these variables individually for every recipient:

- `{{to_email}}`
- `{{subject}}`
- `{{preview_text}}`
- `{{review_1_url}}`
- `{{review_2_url}}`
- `{{review_3_url}}`
- `{{review_4_url}}`
- `{{review_5_url}}`
- `{{review_url}}`
- `{{open_pixel_url}}`
- `{{unsubscribe_url}}`
- `{{watchdog_logo_url}}`
- `{{privacy_url}}`
- `{{terms_url}}`

Do not add an email address, user ID, application ID, ZIP code, SSN/ITIN, or application answers to any tracking URL. The supplied URLs contain only a random opaque token.

## HTML body

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no">
  <title>{{subject}}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1d1d1f;">
  <div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">{{preview_text}}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f5f5f7;">
    <tr><td align="center" style="padding:42px 16px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #e8e8ed;border-radius:28px;overflow:hidden;">
        <tr><td align="center" style="padding:38px 36px 10px 36px;">
          <img src="{{watchdog_logo_url}}" width="190" alt="Watchdog" style="display:block;width:190px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;">
        </td></tr>
        <tr><td align="center" style="padding:31px 42px 46px 42px;">
          <div style="margin:0 0 13px 0;font-size:12px;line-height:18px;font-weight:700;letter-spacing:1.6px;color:#86868b;text-transform:uppercase;">YOUR FEEDBACK</div>
          <h1 style="margin:0 0 16px 0;font-size:38px;line-height:43px;font-weight:750;letter-spacing:-1.35px;color:#1d1d1f;">How did we do?</h1>
          <p style="max-width:425px;margin:0 auto 30px auto;font-size:17px;line-height:27px;color:#515154;">Thanks for using Watchdog to prepare your New Jersey Property Tax Relief application. We'd appreciate a quick rating of your experience.</p>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center"><tr>
            <td style="padding:0 4px;"><a href="{{review_1_url}}" target="_blank" aria-label="Rate Watchdog 1 out of 5 stars" style="display:inline-block;font-size:39px;line-height:44px;color:#f2b01e;text-decoration:none;">★</a></td>
            <td style="padding:0 4px;"><a href="{{review_2_url}}" target="_blank" aria-label="Rate Watchdog 2 out of 5 stars" style="display:inline-block;font-size:39px;line-height:44px;color:#f2b01e;text-decoration:none;">★</a></td>
            <td style="padding:0 4px;"><a href="{{review_3_url}}" target="_blank" aria-label="Rate Watchdog 3 out of 5 stars" style="display:inline-block;font-size:39px;line-height:44px;color:#f2b01e;text-decoration:none;">★</a></td>
            <td style="padding:0 4px;"><a href="{{review_4_url}}" target="_blank" aria-label="Rate Watchdog 4 out of 5 stars" style="display:inline-block;font-size:39px;line-height:44px;color:#f2b01e;text-decoration:none;">★</a></td>
            <td style="padding:0 4px;"><a href="{{review_5_url}}" target="_blank" aria-label="Rate Watchdog 5 out of 5 stars" style="display:inline-block;font-size:39px;line-height:44px;color:#f2b01e;text-decoration:none;">★</a></td>
          </tr></table>
          <div style="margin:11px 0 30px 0;font-size:13px;line-height:19px;color:#86868b;">Tap a star to choose your rating.</div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0 0 30px 0;background:#f5f5f7;border-radius:18px;"><tr>
            <td style="padding:20px 22px;text-align:left;font-size:14px;line-height:22px;color:#6e6e73;"><strong style="color:#1d1d1f;">Have more to say?</strong><br>You can leave a short written review too. Your email address and application details are never published.</td>
          </tr></table>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center"><tr>
            <td bgcolor="#0071e3" style="background:#0071e3;border-radius:980px;"><a href="{{review_url}}" target="_blank" style="display:inline-block;padding:15px 28px;border-radius:980px;font-size:16px;line-height:20px;font-weight:700;color:#ffffff;text-decoration:none;">Leave a review</a></td>
          </tr></table>
          <div style="margin-top:13px;font-size:12px;line-height:18px;color:#a1a1a6;">It only takes a moment.</div>
          <p style="margin:33px auto 0 auto;max-width:410px;font-size:14px;line-height:22px;color:#86868b;">Thanks for helping us make Watchdog better for New Jersey homeowners and renters.</p>
        </td></tr>
        <tr><td align="center" style="padding:27px 34px 31px 34px;border-top:1px solid #e8e8ed;background:#fafafa;">
          <div style="font-size:11px;line-height:18px;color:#86868b;">Watchdog is independent and is not affiliated with the State of New Jersey.</div>
          <div style="margin-top:10px;font-size:11px;line-height:18px;">
            <a href="{{privacy_url}}" target="_blank" style="color:#6e6e73;text-decoration:underline;">Privacy</a><span style="color:#c7c7cc;">&nbsp;&nbsp;·&nbsp;&nbsp;</span><a href="{{terms_url}}" target="_blank" style="color:#6e6e73;text-decoration:underline;">Terms</a><span style="color:#c7c7cc;">&nbsp;&nbsp;·&nbsp;&nbsp;</span><a href="{{unsubscribe_url}}" target="_blank" style="color:#6e6e73;text-decoration:underline;">Unsubscribe</a>
          </div>
          <div style="margin-top:16px;font-size:10px;line-height:16px;color:#a1a1a6;">Watchdog Property Intelligence<br>c/o Opus Elite Real Estate<br>5001 Route 42<br>Turnersville, NJ</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
  <img src="{{open_pixel_url}}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0;overflow:hidden;">
</body>
</html>
```

## Automation behavior

- Worker checks every 5 minutes.
- Only applications generated after automation is enabled are eligible; historical applications are not backfilled.
- Default delay is 60 minutes after generation.
- A user who has already submitted a review is skipped.
- One campaign row per application prevents duplicate sends.
- Delivery retries up to 3 times with a lease to prevent concurrent duplicate sends.
- Review-request unsubscribes suppress this review campaign only; filing/account service emails are unaffected.
- Estimated opens can be inflated by Apple Mail Privacy Protection or image proxies. Clicks and submitted reviews are stronger engagement signals.
