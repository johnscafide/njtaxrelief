import { createClient } from 'npm:@supabase/supabase-js@2.95.0';

const URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MAX = 5000;
const INITIAL_PCM_SIZE = '6 x 8.5';
const INITIAL_PCM_MAIL_CLASS = 'FirstClass';
const WATCHDOG_MINIMUM = 50;

const clean = (value: unknown, max = 180) => String(value ?? '')
  .trim()
  .replace(/[\u0000-\u001f]/g, '')
  .slice(0, max);

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  });
}

function cfg() {
  const token = clean(Deno.env.get('PCM_ACCESS_TOKEN'), 4000);
  const key = clean(Deno.env.get('PCM_API_KEY'), 1000);
  const secret = clean(Deno.env.get('PCM_API_SECRET'), 2000);
  const tokenUrl = clean(Deno.env.get('PCM_TOKEN_URL'), 1000);
  const base = clean(
    Deno.env.get('PCM_API_BASE_URL') || 'https://api.pcmintegrations.com/v2/directmail-api',
    1000,
  ).replace(/\/$/, '');
  const path = '/' + clean(Deno.env.get('PCM_ORDER_PATH') || '/order', 300).replace(/^\/+/, '');
  return {
    token,
    key,
    secret,
    tokenUrl,
    base,
    path,
    configured: Boolean(token || (key && secret && tokenUrl)),
    enabled: String(Deno.env.get('PCM_LIVE_LAUNCH_ENABLED') || '').toLowerCase() === 'true',
  };
}

let cached = '';
let expiry = 0;

async function pcmToken() {
  const current = cfg();
  if (current.token) return current.token;
  if (cached && Date.now() < expiry - 60000) return cached;
  if (!current.key || !current.secret || !current.tokenUrl) {
    throw new Error('PCM live credentials are not connected');
  }

  const response = await fetch(current.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ apiKey: current.key, apiSecret: current.secret }),
  });
  const text = await response.text();
  let data: any = {};
  try {
    data = JSON.parse(text);
  } catch {
    // Keep the normalized provider error below.
  }
  if (!response.ok) throw new Error(`PCM token request failed (${response.status})`);
  cached = clean(data.token ?? data.accessToken ?? data.access_token, 4000);
  if (!cached) throw new Error('PCM token response was invalid');
  expiry = Date.now() + 45 * 60000;
  return cached;
}

async function hash(text: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes)).map((value) => value.toString(16).padStart(2, '0')).join('');
}

function reportedCount(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : null;
}

function providerRecipientOutcome(output: any, expectedRecipientCount: number) {
  const successfulOrders = Array.isArray(output?.successfulOrders) ? output.successfulOrders : [];
  const failedOrders = Array.isArray(output?.failedOrders) ? output.failedOrders : [];
  const orders = [...successfulOrders, ...failedOrders];
  const sumReported = (key: string) => {
    let reported = false;
    let total = 0;
    for (const order of orders) {
      const value = reportedCount(order?.[key]);
      if (value === null) continue;
      reported = true;
      total += value;
    }
    return reported ? total : null;
  };
  const acceptedRecipientCount = sumReported('successfulRecipientCount');
  const rejectedRecipientCount = sumReported('failedRecipientCount');
  const reconciliationRequired = failedOrders.length > 0
    || (rejectedRecipientCount !== null && rejectedRecipientCount > 0)
    || (acceptedRecipientCount !== null && acceptedRecipientCount !== expectedRecipientCount);
  return {
    successful_order_count: successfulOrders.length,
    failed_order_count: failedOrders.length,
    expected_recipient_count: expectedRecipientCount,
    provider_accepted_recipient_count: acceptedRecipientCount,
    provider_rejected_recipient_count: rejectedRecipientCount,
    recipient_count_reconciliation_required: reconciliationRequired,
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed' });
  if ((req.headers.get('Authorization') || '') !== `Bearer ${SERVICE}`) {
    return reply(403, { error: 'Service authorization required' });
  }

  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({}));
  const campaignId = clean(body.campaign_id, 80);
  const paymentId = clean(body.payment_id, 80);
  const source = clean(body.source || 'payment', 40);
  if (!campaignId || !paymentId) {
    return reply(400, { error: 'campaign_id and payment_id are required' });
  }

  const pay = await admin
    .from('marketing_payments')
    .select('id,user_id,campaign_id,quote_id,status,amount_cents,refunded_cents,metadata,paid_at')
    .eq('id', paymentId)
    .eq('campaign_id', campaignId)
    .maybeSingle();
  if (pay.error || !pay.data) return reply(404, { error: 'Paid marketing payment not found' });
  const payment = pay.data;
  if (!['paid', 'succeeded', 'completed'].includes(String(payment.status))) {
    return reply(409, { error: 'Marketing payment is not paid', code: 'PAYMENT_NOT_PAID' });
  }

  const { data: isTest } = await admin.rpc('is_watchdog_test_account', { p_user_id: payment.user_id });
  if (isTest) {
    return reply(403, {
      error: 'Sandbox accounts cannot submit production mail.',
      code: 'WATCHDOG_TEST_NO_REAL_SPEND',
    });
  }

  const quoteResult = await admin
    .from('marketing_price_quotes')
    .select('id,user_id,campaign_id,provider_key,channel,quantity,vendor_cost_cents,retail_cents,margin_cents,pricing_detail')
    .eq('id', payment.quote_id)
    .eq('user_id', payment.user_id)
    .eq('campaign_id', campaignId)
    .maybeSingle();
  if (quoteResult.error || !quoteResult.data) {
    return reply(409, { error: 'Authoritative quote is missing' });
  }

  const quote = quoteResult.data;
  const product = clean(quote.pricing_detail?.product_type || 'postcard', 40).toLowerCase();
  const sizeLabel = clean(quote.pricing_detail?.size_label, 100);
  const mailClassLabel = clean(quote.pricing_detail?.mail_class, 40);

  if (quote.provider_key !== 'pcm' || quote.channel !== 'direct_mail') {
    return reply(409, { error: 'This payment is not for PCM Direct Mail' });
  }
  if (
    product !== 'postcard' ||
    sizeLabel !== INITIAL_PCM_SIZE ||
    mailClassLabel.toLowerCase() !== INITIAL_PCM_MAIL_CLASS.toLowerCase()
  ) {
    return reply(409, {
      error: 'Initial Watchdog Direct Mail production supports only 6 x 8.5 First Class postcards.',
      code: 'PCM_INITIAL_LAUNCH_FORMAT_REQUIRED',
      required: { product_type: 'postcard', size_label: INITIAL_PCM_SIZE, mail_class: INITIAL_PCM_MAIL_CLASS },
    });
  }
  if (Number(quote.quantity || 0) < WATCHDOG_MINIMUM) {
    return reply(409, {
      error: `Watchdog Direct Mail requires at least ${WATCHDOG_MINIMUM} valid recipients.`,
      code: 'DIRECT_MAIL_MINIMUM_NOT_MET',
      minimum_quantity: WATCHDOG_MINIMUM,
    });
  }

  const campaignResult = await admin
    .from('marketing_campaigns')
    .select('id,user_id,name,status,settings')
    .eq('id', campaignId)
    .eq('user_id', payment.user_id)
    .maybeSingle();
  if (campaignResult.error || !campaignResult.data) return reply(404, { error: 'Campaign not found' });
  const campaign = campaignResult.data;
  if (campaign.settings?.pcm_design?.proof_review?.status !== 'approved') {
    return reply(409, { error: 'PCM proof must be approved before fulfillment', code: 'PCM_PROOF_APPROVAL_REQUIRED' });
  }

  const creativeResult = await admin
    .from('marketing_creatives')
    .select('id,creative_type,provider_design_id,content,status,version')
    .eq('campaign_id', campaignId)
    .eq('user_id', payment.user_id)
    .eq('channel', 'direct_mail')
    .eq('status', 'approved')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (creativeResult.error || !creativeResult.data) return reply(409, { error: 'Approved creative is missing' });
  const creative = creativeResult.data;
  if (!clean(creative.provider_design_id, 80)) {
    return reply(409, { error: 'PCM Design ID is required before fulfillment', code: 'PCM_DESIGN_REQUIRED' });
  }

  const recipients = await admin.rpc('marketing_direct_mail_fulfillment_recipients', {
    p_user_id: payment.user_id,
    p_campaign_id: campaignId,
    p_limit: MAX + 1,
  });
  if (recipients.error || !recipients.data?.length) {
    return reply(409, { error: 'Prepared mailing recipients are missing' });
  }
  if (recipients.data.length > MAX) {
    return reply(409, { error: `Automatic PCM fulfillment is limited to ${MAX} recipients per campaign` });
  }
  if (recipients.data.length < WATCHDOG_MINIMUM) {
    return reply(409, {
      error: `Watchdog Direct Mail requires at least ${WATCHDOG_MINIMUM} valid recipients at fulfillment.`,
      code: 'DIRECT_MAIL_MINIMUM_NOT_MET',
      minimum_quantity: WATCHDOG_MINIMUM,
      actual: recipients.data.length,
    });
  }
  if (recipients.data.length !== Number(quote.quantity)) {
    return reply(409, {
      error: 'Prepared audience changed after payment. Review is required.',
      code: 'RECIPIENT_COUNT_CHANGED',
      expected: Number(quote.quantity),
      actual: recipients.data.length,
    });
  }

  const creditCents = Math.max(0, Number(payment.metadata?.credit_applied_cents || 0));
  const retailCents = Number(quote.retail_cents || 0);
  const vendorCents = Number(quote.vendor_cost_cents || 0);
  const netMargin = Math.max(-vendorCents, retailCents - creditCents - vendorCents);
  const fingerprint = await hash([
    campaignId,
    creative.id,
    quote.id,
    payment.id,
    String(recipients.data.length),
    creative.provider_design_id,
    INITIAL_PCM_SIZE,
    INITIAL_PCM_MAIL_CLASS,
  ].join('|'));

  let approval = (
    await admin
      .from('marketing_launch_approvals')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('channel', 'direct_mail')
      .eq('provider_key', 'pcm')
      .eq('approval_fingerprint', fingerprint)
      .maybeSingle()
  ).data;

  if (!approval) {
    const created = await admin
      .from('marketing_launch_approvals')
      .insert({
        user_id: payment.user_id,
        campaign_id: campaignId,
        channel: 'direct_mail',
        provider_key: 'pcm',
        creative_id: creative.id,
        quote_id: quote.id,
        payment_id: payment.id,
        recipient_count: recipients.data.length,
        approval_fingerprint: fingerprint,
        status: 'approved',
        approved_at: new Date().toISOString(),
      })
      .select('*')
      .single();
    if (created.error) return reply(503, { error: 'Launch approval could not be recorded' });
    approval = created.data;
  }

  const idempotencyKey = `pcm:marketing:${campaignId}:${approval.id}`;
  let job = (
    await admin.from('marketing_provider_jobs').select('*').eq('idempotency_key', idempotencyKey).maybeSingle()
  ).data;
  if (job && ['submitted', 'pending', 'processing', 'live', 'mailed', 'delivered', 'completed'].includes(job.status)) {
    const reconciliationRequired = Boolean(job.response_summary?.recipient_count_reconciliation_required);
    return reply(reconciliationRequired ? 202 : 200, {
      job,
      idempotent_replay: true,
      submitted: !reconciliationRequired,
      reconciliation_required: reconciliationRequired,
    });
  }

  const jobData = {
    user_id: payment.user_id,
    campaign_id: campaignId,
    provider_key: 'pcm',
    mode: 'live',
    idempotency_key: idempotencyKey,
    requires_funding: true,
    quote_id: quote.id,
    payment_id: payment.id,
    product_type: product,
    size_label: INITIAL_PCM_SIZE,
    mail_class: INITIAL_PCM_MAIL_CLASS,
    recipient_count: recipients.data.length,
    retail_cents: retailCents,
    credit_cents: creditCents,
    vendor_cost_cents: vendorCents,
    gross_margin_cents: netMargin,
    request_summary: {
      recipient_count: recipients.data.length,
      creative_id: creative.id,
      approval_id: approval.id,
      product_type: product,
      size_label: INITIAL_PCM_SIZE,
      mail_class: INITIAL_PCM_MAIL_CLASS,
      watchdog_minimum_quantity: WATCHDOG_MINIMUM,
      source,
      cash_due_cents: Number(payment.metadata?.amount_due_cents || 0),
      vendor_contract_confirmed_at: '2026-08-19',
    },
  };

  const current = cfg();
  if (!current.configured || !current.enabled) {
    if (!job) {
      const inserted = await admin
        .from('marketing_provider_jobs')
        .insert({ ...jobData, status: !current.configured ? 'awaiting_provider_credentials' : 'awaiting_live_enable' })
        .select('*')
        .single();
      if (!inserted.error) job = inserted.data;
    }
    return reply(202, {
      queued: true,
      submitted: false,
      status: job?.status || 'awaiting_live_enable',
      code: !current.configured ? 'PCM_NOT_CONNECTED' : 'PCM_LIVE_LAUNCH_DISABLED',
      job_id: job?.id || null,
    });
  }

  if (!job) {
    const inserted = await admin.from('marketing_provider_jobs').insert({ ...jobData, status: 'queued' }).select('*').single();
    if (inserted.error) return reply(503, { error: 'Provider job could not be created' });
    job = inserted.data;
  } else {
    await admin.from('marketing_provider_jobs').update({ ...jobData, status: 'queued', updated_at: new Date().toISOString() }).eq('id', job.id);
  }
  await admin.from('marketing_provider_jobs').update({ status: 'submitting', updated_at: new Date().toISOString() }).eq('id', job.id);

  try {
    const token = await pcmToken();
    const design = /^\d+$/.test(String(creative.provider_design_id))
      ? Number(creative.provider_design_id)
      : creative.provider_design_id;
    const payload = [{
      extRefNbr: `WD-${campaignId.slice(0, 8)}-${approval.id.slice(0, 8)}`,
      orderConfig: {
        designID: design,
        mailClass: 'FirstClass',
        globalDesignVariables: [],
      },
      recipientList: recipients.data.map((recipient: any) => ({
        firstName: 'Current',
        lastName: 'Resident',
        address: clean(recipient.address, 140),
        address2: '',
        city: clean(recipient.city, 80),
        state: clean(recipient.state || 'NJ', 2),
        zipCode: clean(recipient.zip, 10).slice(0, 5),
        extRefNbr: clean(recipient.property_key, 160),
        recipientDesignVariables: [],
      })),
    }];

    const response = await fetch(current.base + current.path, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'Postcard',
      },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    let output: any = {};
    try {
      output = JSON.parse(text);
    } catch {
      output = { message: clean(text, 500) };
    }
    if (!response.ok) {
      throw new Error(`PCM order request failed (${response.status}): ${clean(output?.message || output?.error, 500)}`);
    }

    const batch = clean(output?.batchID, 160) || null;
    const orderId = clean(output?.successfulOrders?.[0]?.orderID, 160) || null;
    const outcome = providerRecipientOutcome(output, recipients.data.length);
    if (outcome.failed_order_count && !outcome.successful_order_count) {
      throw new Error('PCM did not accept the production order');
    }

    const now = new Date().toISOString();
    const done = await admin
      .from('marketing_provider_jobs')
      .update({
        status: 'submitted',
        provider_job_id: orderId || batch,
        response_summary: {
          batch_id: batch,
          order_id: orderId,
          successful_orders: outcome.successful_order_count,
          failed_orders: outcome.failed_order_count,
          expected_recipient_count: outcome.expected_recipient_count,
          provider_accepted_recipient_count: outcome.provider_accepted_recipient_count,
          provider_rejected_recipient_count: outcome.provider_rejected_recipient_count,
          recipient_count_reconciliation_required: outcome.recipient_count_reconciliation_required,
          provider_order_status: 'pending',
          initial_launch_contract: true,
        },
        submitted_at: now,
        updated_at: now,
      })
      .eq('id', job.id)
      .select('*')
      .single();

    await admin.from('marketing_launch_approvals').update({ status: 'consumed', consumed_at: now }).eq('id', approval.id);

    if (outcome.recipient_count_reconciliation_required) {
      return reply(202, {
        submitted: false,
        provider_submission_detected: Boolean(orderId || batch || outcome.successful_order_count),
        reconciliation_required: true,
        code: 'PROVIDER_RECIPIENT_RECONCILIATION_REQUIRED',
        job: done.data,
        provider: { batch_id: batch, order_id: orderId, initial_status: 'pending' },
        expected_recipient_count: outcome.expected_recipient_count,
        provider_accepted_recipient_count: outcome.provider_accepted_recipient_count,
        provider_rejected_recipient_count: outcome.provider_rejected_recipient_count,
        failed_order_count: outcome.failed_order_count,
        credit_reconciliation_required: creditCents > 0,
      });
    }

    await admin.from('marketing_campaigns').update({ status: 'live', launched_at: now, updated_at: now }).eq('id', campaignId).eq('user_id', payment.user_id);
    await admin.from('marketing_events').insert({
      user_id: payment.user_id,
      campaign_id: campaignId,
      provider_job_id: job.id,
      event_type: 'direct_mail.submitted',
      source: 'pcm',
      payload: {
        approval_id: approval.id,
        payment_id: payment.id,
        batch_id: batch,
        order_id: orderId,
        recipient_count: recipients.data.length,
        provider_accepted_recipient_count: outcome.provider_accepted_recipient_count,
        provider_rejected_recipient_count: outcome.provider_rejected_recipient_count,
        product_type: product,
        size_label: INITIAL_PCM_SIZE,
        mail_class: INITIAL_PCM_MAIL_CLASS,
        retail_cents: retailCents,
        credit_cents: creditCents,
        vendor_cost_cents: vendorCents,
        gross_margin_cents: netMargin,
      },
    });

    return reply(200, {
      submitted: true,
      job: done.data,
      provider: { batch_id: batch, order_id: orderId, initial_status: 'pending' },
      recipient_count: recipients.data.length,
      provider_accepted_recipient_count: outcome.provider_accepted_recipient_count,
      provider_rejected_recipient_count: outcome.provider_rejected_recipient_count,
      format: { size_label: INITIAL_PCM_SIZE, mail_class: INITIAL_PCM_MAIL_CLASS },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PCM launch failed';
    await admin
      .from('marketing_provider_jobs')
      .update({ status: 'failed', response_summary: { error: message }, updated_at: new Date().toISOString() })
      .eq('id', job.id);
    await admin
      .from('marketing_campaigns')
      .update({ status: 'launch_failed', updated_at: new Date().toISOString() })
      .eq('id', campaignId)
      .eq('user_id', payment.user_id);
    await admin.from('marketing_events').insert({
      user_id: payment.user_id,
      campaign_id: campaignId,
      provider_job_id: job.id,
      event_type: 'direct_mail.failed',
      source: 'pcm',
      payload: { payment_id: payment.id, error: message },
    });
    return reply(502, { error: message, job_id: job.id });
  }
});
