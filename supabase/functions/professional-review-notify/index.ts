import { createClient } from 'npm:@supabase/supabase-js@2';

type Json = Record<string, unknown>;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const clean = (value: unknown, max = 500) => String(value || '').trim().slice(0, max);

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL') || '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !anon || !serviceKey) return json({ error: 'Notification service unavailable' }, 503);

  const auth = req.headers.get('Authorization') || '';
  const userDb = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: { user }, error: userError } = await userDb.auth.getUser();
  if (userError || !user) return json({ error: 'Authentication required' }, 401);

  const outbox = await admin.from('professional_notification_outbox')
    .select('id,event_type,delivery_status,attempts,payload,created_at')
    .eq('user_id', user.id)
    .eq('event_type', 'realtor_verification.submitted')
    .in('delivery_status', ['pending','failed'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (outbox.error) return json({ error: 'Notification outbox unavailable' }, 500);
  if (!outbox.data) return json({ ok: true, email_sent: false, reason: 'nothing_pending' });

  const [verification, profile, license] = await Promise.all([
    admin.from('professional_realtor_verifications')
      .select('nar_member_id,local_association,proof_url,user_note,verification_status,submitted_at')
      .eq('user_id', user.id).maybeSingle(),
    admin.from('profiles')
      .select('email,display_name,full_name,pro_agent')
      .eq('id', user.id).maybeSingle(),
    admin.from('professional_license_verifications')
      .select('license_number,verified_professional,licensee_name,verification_status')
      .eq('user_id', user.id).maybeSingle(),
  ]);

  const row = verification.data || {};
  const p = profile.data || {};
  const proAgent = p.pro_agent && typeof p.pro_agent === 'object' ? p.pro_agent as Json : {};
  const name = clean(p.display_name || p.full_name || user.user_metadata?.full_name || user.email || 'Watchdog agent', 160);

  const emailPrivateKey = Deno.env.get('EMAILJS_PRIVATE_KEY') || '';
  const emailPublicKey = Deno.env.get('EMAILJS_PUBLIC_KEY') || '';
  const emailServiceId = Deno.env.get('EMAILJS_SERVICE_ID') || '';
  const emailTemplateId = Deno.env.get('EMAILJS_PROFESSIONAL_REVIEW_TEMPLATE_ID') || 'template_professional_review';
  const adminEmail = Deno.env.get('PROFESSIONAL_REVIEW_ADMIN_EMAIL') || Deno.env.get('VERIFY_ADMIN_EMAIL') || '';
  const fromEmail = Deno.env.get('PROFESSIONAL_REVIEW_FROM_EMAIL') || Deno.env.get('VERIFY_FROM_EMAIL') || '';
  const ready = !!(emailPrivateKey && emailPublicKey && emailServiceId && emailTemplateId && adminEmail && fromEmail);

  if (!ready) {
    await admin.from('professional_notification_outbox').update({
      delivery_status: 'failed',
      attempts: Number(outbox.data.attempts || 0) + 1,
      last_error: 'EmailJS professional review notification is not configured.',
      updated_at: new Date().toISOString(),
    }).eq('id', outbox.data.id);
    return json({ ok: true, email_sent: false, email_configured: false, backoffice_queue: true });
  }

  const params = {
    to_email: adminEmail,
    from_email: fromEmail,
    subject: 'New Watchdog REALTOR® verification review',
    agent_name: name,
    agent_email: clean(p.email || user.email || '', 254),
    nar_member_id: clean(row.nar_member_id, 80),
    local_association: clean(row.local_association, 180),
    proof_url: clean(row.proof_url, 700),
    user_note: clean(row.user_note, 1000),
    brokerage_name: clean(proAgent.brokerage_name, 180),
    nj_license_number: clean(license.data?.license_number, 80),
    nj_license_status: license.data?.verified_professional === true ? 'Verified NJ license' : clean(license.data?.verification_status || 'Not verified', 80),
    submitted_at: clean(row.submitted_at || outbox.data.created_at, 80),
    backoffice_url: 'https://www.watchdogindex.com/backoffice/professional-verifications',
    instructions: 'Open the Watchdog Professional Reviews inbox to verify, request more information, or reject this REALTOR® membership submission.',
  };

  try {
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: emailServiceId,
        template_id: emailTemplateId,
        user_id: emailPublicKey,
        accessToken: emailPrivateKey,
        template_params: params,
      }),
    });
    const body = await response.text().catch(() => '');

    if (!response.ok) {
      await admin.from('professional_notification_outbox').update({
        delivery_status: 'failed',
        attempts: Number(outbox.data.attempts || 0) + 1,
        last_error: ('EmailJS HTTP ' + response.status + ': ' + clean(body, 260)).slice(0, 500),
        updated_at: new Date().toISOString(),
      }).eq('id', outbox.data.id);
      return json({ ok: true, email_sent: false, provider_status: response.status, backoffice_queue: true });
    }

    await admin.from('professional_notification_outbox').update({
      delivery_status: 'sent',
      attempts: Number(outbox.data.attempts || 0) + 1,
      last_error: null,
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', outbox.data.id);

    await admin.from('professional_review_events').insert({
      user_id: user.id,
      entity_type: 'realtor_verification',
      entity_key: user.id,
      event_type: 'realtor_verification.admin_notified',
      details: { provider: 'emailjs', to: adminEmail },
    });

    return json({ ok: true, email_sent: true, backoffice_queue: true });
  } catch (error) {
    await admin.from('professional_notification_outbox').update({
      delivery_status: 'failed',
      attempts: Number(outbox.data.attempts || 0) + 1,
      last_error: clean(error instanceof Error ? error.message : 'Email send failed', 500),
      updated_at: new Date().toISOString(),
    }).eq('id', outbox.data.id);
    return json({ ok: true, email_sent: false, backoffice_queue: true });
  }
});
