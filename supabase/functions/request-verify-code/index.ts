import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json' }
});
const clean = (value: unknown, max = 100) => String(value || '').trim().slice(0, max);
async function sha(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map(x => x.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const resendKey = Deno.env.get('RESEND_API_KEY') || '';
  const adminEmail = Deno.env.get('VERIFY_ADMIN_EMAIL') || '';
  const fromEmail = Deno.env.get('VERIFY_FROM_EMAIL') || '';
  const emailReady = !!(resendKey && adminEmail && fromEmail);
  if (req.method === 'GET') return json({
    ok: true,
    service: 'request-verify-code',
    database_configured: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    admin_email_configured: emailReady,
    delivery_mode: 'manual postcard'
  });

  try {
    const auth = req.headers.get('Authorization') || '';
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ ok: false, reason: 'Sign in required', stage: 'auth' }, 401);

    const body = await req.json();
    const pin = clean(body.pams_pin, 40);
    const line1 = clean(body.address_line1);
    const city = clean(body.city, 80);
    const postal = clean(body.postal_code, 12);
    if (!pin || !line1 || !city || !/^[0-9]{5}(?:-[0-9]{4})?$/.test(postal)) {
      return json({ ok: false, reason: 'A complete New Jersey mailing address is required', stage: 'validation' }, 400);
    }
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await admin.from('ownership_verifications').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).gte('created_at', since);
    if ((count || 0) >= 3) return json({ ok: false, reason: 'Daily mailing limit reached. Try again tomorrow.', stage: 'rate_limit' }, 429);
    if (!emailReady) return json({ ok: false, reason: 'Administrator email delivery is not configured', stage: 'email_configuration' }, 503);

    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += alphabet[crypto.getRandomValues(new Uint32Array(1))[0] % alphabet.length];
    const nonce = crypto.randomUUID();
    const hash = await sha(code + nonce);
    const address = { address_line1: line1, city, state: 'NJ', postal_code: postal };
    const { data: row, error: insertError } = await admin.from('ownership_verifications').insert({
      user_id: user.id, pams_pin: pin, delivery_address: address, code_hash: hash,
      code_nonce: nonce, status: 'queued', provider: 'manual_email'
    }).select('id').single();
    if (insertError) return json({ ok: false, reason: 'Verification queue is unavailable', stage: 'database', detail: insertError.code }, 500);

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: fromEmail,
        to: [adminEmail],
        subject: 'Postcard verification request: ' + line1 + ', ' + city,
        html: '<h2>Mail this Watchdog verification postcard</h2>' +
          '<p><b>Mail to:</b><br>' + line1 + '<br>' + city + ', NJ ' + postal + '</p>' +
          '<p><b>Verification code:</b></p><p style="font-size:32px;font-weight:800;letter-spacing:6px">' + code + '</p>' +
          '<p>Request ID: ' + row.id + '<br>PAMS PIN: ' + pin + '<br>Expires in 30 days.</p>' +
          '<p>Do not email this code to the requester. Put it on the postcard you mail to the property.</p>'
      })
    });
    const emailResult = await emailResponse.json().catch(() => ({}));
    if (!emailResponse.ok) {
      await admin.from('ownership_verifications').update({
        status: 'failed', provider_message: String(emailResult?.message || emailResponse.status).slice(0, 300), updated_at: new Date().toISOString()
      }).eq('id', row.id);
      return json({ ok: false, reason: 'The administrator email could not be sent', stage: 'admin_email', provider_status: emailResponse.status }, 502);
    }
    await admin.from('ownership_verifications').update({
      status: 'awaiting_mail', provider_id: emailResult?.id || null, updated_at: new Date().toISOString()
    }).eq('id', row.id);
    return json({ ok: true, status: 'awaiting_mail', request_id: row.id, expires_in_days: 30 });
  } catch (error) {
    return json({ ok: false, reason: 'Unexpected verification service error', stage: 'function', detail: String(error).slice(0, 180) }, 500);
  }
});
