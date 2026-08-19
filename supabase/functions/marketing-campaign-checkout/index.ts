import { createClient } from 'npm:@supabase/supabase-js@2.95.0';
import Stripe from 'npm:stripe@^22';

const ALLOWED_ORIGINS = new Set([
  'https://njpropertytaxrelief.com',
  'https://www.njpropertytaxrelief.com',
]);
const INITIAL_PCM_SIZE = '6 x 8.5';
const INITIAL_PCM_MAIL_CLASS = 'FirstClass';
const WATCHDOG_MINIMUM = 50;

function cors(req: Request) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://njpropertytaxrelief.com',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function reply(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors(req),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  });
}

function enabled() {
  return String(Deno.env.get('MARKETING_BILLING_ENABLED') || '').toLowerCase() === 'true';
}

function pcmEnabled() {
  return String(Deno.env.get('PCM_LIVE_LAUNCH_ENABLED') || '').toLowerCase() === 'true';
}

function clean(value: unknown, max = 160) {
  return String(value ?? '').trim().replace(/[\u0000-\u001f]/g, '').slice(0, max);
}

async function triggerFulfillment(
  url: string,
  service: string,
  campaignId: string,
  paymentId: string,
  source: string,
) {
  try {
    const response = await fetch(`${url}/functions/v1/marketing-direct-mail-fulfill`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${service}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ campaign_id: campaignId, payment_id: paymentId, source }),
    });
    const text = await response.text();
    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text.slice(0, 300) };
    }
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: { error: error instanceof Error ? error.message : 'Fulfillment handoff failed' },
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return reply(req, 405, { error: 'Method not allowed' });

  const origin = req.headers.get('origin') || '';
  if (origin && !ALLOWED_ORIGINS.has(origin)) return reply(req, 403, { error: 'Origin not allowed' });
  if (!enabled()) {
    return reply(req, 503, {
      error: 'Marketing campaign billing is not live yet',
      code: 'MARKETING_BILLING_DISABLED',
    });
  }

  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return reply(req, 401, { error: 'Sign in required' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const admin = createClient(url, service, { auth: { persistSession: false } });

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return reply(req, 401, { error: 'Session could not be verified' });

  const { data: isTest } = await admin.rpc('is_watchdog_test_account', { p_user_id: user.id });
  if (isTest) {
    return reply(req, 403, {
      error: 'Sandbox accounts cannot create real campaign billing.',
      code: 'WATCHDOG_TEST_NO_REAL_SPEND',
    });
  }

  const access = await userClient.rpc('marketing_studio_bootstrap');
  if (access.error) return reply(req, 403, { error: 'Marketing Studio access required' });
  const plan = clean(access.data?.plan, 30);

  const body = await req.json().catch(() => ({}));
  const quoteId = clean(body?.quote_id, 80);
  if (!quoteId) return reply(req, 400, { error: 'quote_id is required' });

  const quoteResult = await admin
    .from('marketing_price_quotes')
    .select('id,user_id,campaign_id,provider_key,channel,plan_key,quantity,retail_cents,expires_at,pricing_detail')
    .eq('id', quoteId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (quoteResult.error || !quoteResult.data) return reply(req, 404, { error: 'Quote not found' });

  const quote = quoteResult.data;
  if (new Date(quote.expires_at || 0).getTime() <= Date.now()) {
    return reply(req, 409, { error: 'This quote expired. Create a new quote.', code: 'QUOTE_EXPIRED' });
  }
  if (String(quote.plan_key) !== plan) {
    return reply(req, 409, { error: 'Your plan changed. Create a new quote.', code: 'PLAN_CHANGED' });
  }
  if (Number(quote.retail_cents || 0) <= 0) return reply(req, 409, { error: 'Quote amount is invalid' });

  const product = clean(quote.pricing_detail?.product_type || 'postcard', 40).toLowerCase();
  const sizeLabel = clean(quote.pricing_detail?.size_label, 100);
  const mailClass = clean(quote.pricing_detail?.mail_class, 40);

  if (quote.provider_key === 'pcm') {
    if (
      product !== 'postcard' ||
      sizeLabel !== INITIAL_PCM_SIZE ||
      mailClass.toLowerCase() !== INITIAL_PCM_MAIL_CLASS.toLowerCase()
    ) {
      return reply(req, 409, {
        error: 'Initial Watchdog Direct Mail checkout supports only 6 x 8.5 First Class postcards.',
        code: 'PCM_INITIAL_LAUNCH_FORMAT_REQUIRED',
        required: {
          product_type: 'postcard',
          size_label: INITIAL_PCM_SIZE,
          mail_class: INITIAL_PCM_MAIL_CLASS,
        },
      });
    }
    if (Number(quote.quantity || 0) < WATCHDOG_MINIMUM) {
      return reply(req, 409, {
        error: `Watchdog Direct Mail requires at least ${WATCHDOG_MINIMUM} valid recipients.`,
        code: 'DIRECT_MAIL_MINIMUM_NOT_MET',
        minimum_quantity: WATCHDOG_MINIMUM,
      });
    }
    if (!pcmEnabled()) {
      return reply(req, 503, {
        error: 'PCM production checkout is intentionally locked until live fulfillment certification is complete',
        code: 'PCM_LIVE_LAUNCH_DISABLED',
      });
    }
  }

  const campaignResult = await admin
    .from('marketing_campaigns')
    .select('id,name,status,settings')
    .eq('id', quote.campaign_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (campaignResult.error || !campaignResult.data) return reply(req, 404, { error: 'Campaign not found' });
  const campaign = campaignResult.data;

  if (!['draft', 'approved', 'payment_pending'].includes(campaign.status)) {
    return reply(req, 409, { error: 'Campaign is not eligible for checkout' });
  }
  if (quote.provider_key === 'pcm' && campaign.settings?.pcm_design?.proof_review?.status !== 'approved') {
    return reply(req, 409, { error: 'Approve the PCM proof before checkout', code: 'PCM_PROOF_APPROVAL_REQUIRED' });
  }

  const idempotencyKey = `stripe:marketing:${quote.campaign_id}:${quote.id}`;
  const existing = await admin
    .from('marketing_payments')
    .select('id,status,processor_payment_id,amount_cents,metadata')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (existing.data?.status === 'paid') {
    return reply(req, 409, {
      error: 'This quote is already funded',
      code: 'ALREADY_FUNDED',
      payment_id: existing.data.id,
    });
  }
  if (existing.data?.status === 'pending' && existing.data.metadata?.checkout_url) {
    return reply(req, 200, {
      url: existing.data.metadata.checkout_url,
      session_id: existing.data.processor_payment_id,
      payment_id: existing.data.id,
      reused: true,
      credit_applied_cents: Number(existing.data.metadata?.credit_applied_cents || 0),
      amount_due_cents: Number(existing.data.metadata?.amount_due_cents || existing.data.amount_cents || 0),
    });
  }

  const reserved = await admin.rpc('marketing_credit_reserve', {
    p_user_id: user.id,
    p_campaign_id: quote.campaign_id,
    p_quote_id: quote.id,
    p_requested_cents: Number(quote.retail_cents),
  });
  if (reserved.error) {
    return reply(req, 503, { error: 'Marketing credit could not be reserved', code: 'CREDIT_RESERVATION_FAILED' });
  }

  const reservationId = reserved.data?.reservation_id || null;
  const creditCents = Math.max(0, Number(reserved.data?.credit_cents || 0));
  const amountDue = Math.max(0, Number(quote.retail_cents) - creditCents);
  const creditMeta = {
    credit_reservation_id: reservationId,
    credit_applied_cents: creditCents,
    retail_cents: Number(quote.retail_cents),
    amount_due_cents: amountDue,
    product_type: product,
    size_label: sizeLabel || null,
    mail_class: mailClass || null,
    watchdog_minimum_quantity: WATCHDOG_MINIMUM,
    initial_launch_contract: quote.provider_key === 'pcm',
  };

  if (amountDue === 0 && reservationId) {
    const paymentRow = {
      user_id: user.id,
      campaign_id: quote.campaign_id,
      quote_id: quote.id,
      processor: 'watchdog_credit',
      processor_payment_id: `credit:${reservationId}`,
      amount_cents: Number(quote.retail_cents),
      status: 'paid',
      paid_at: new Date().toISOString(),
      idempotency_key: idempotencyKey,
      metadata: { ...creditMeta, credit_only: true },
    };
    const saved = existing.data
      ? await admin.from('marketing_payments').update(paymentRow).eq('id', existing.data.id).select('id').single()
      : await admin.from('marketing_payments').insert(paymentRow).select('id').single();
    if (saved.error) {
      await admin.rpc('marketing_credit_finalize', {
        p_reservation_id: reservationId,
        p_action: 'release',
        p_detail: { reason: 'payment_ledger_failed' },
      });
      return reply(req, 503, { error: 'Campaign payment ledger could not be created' });
    }

    const finalized = await admin.rpc('marketing_credit_finalize', {
      p_reservation_id: reservationId,
      p_action: 'redeem',
      p_detail: { processor: 'watchdog_credit', campaign_id: quote.campaign_id, quote_id: quote.id },
    });
    if (finalized.error) {
      return reply(req, 503, { error: 'Marketing credit could not be redeemed', code: 'CREDIT_REDEEM_FAILED' });
    }

    await admin.from('marketing_campaigns').update({ status: 'funded', updated_at: new Date().toISOString() }).eq('id', quote.campaign_id).eq('user_id', user.id);
    await admin.from('marketing_events').insert({
      user_id: user.id,
      campaign_id: quote.campaign_id,
      event_type: 'payment.captured',
      source: 'watchdog_credit',
      payload: {
        payment_id: saved.data.id,
        quote_id: quote.id,
        amount_cents: quote.retail_cents,
        credit_applied_cents: creditCents,
        amount_due_cents: 0,
        product_type: product,
        size_label: sizeLabel,
        mail_class: mailClass,
      },
    });

    const fulfillment = await triggerFulfillment(url, service, String(quote.campaign_id), String(saved.data.id), 'watchdog_credit');
    const successUrl = `https://njpropertytaxrelief.com/property/marketing-studio/review?campaign=${encodeURIComponent(String(quote.campaign_id))}&payment=success&credit=applied`;
    return reply(req, 200, {
      funded: true,
      credit_only: true,
      url: successUrl,
      payment_id: saved.data.id,
      quote_id: quote.id,
      credit_applied_cents: creditCents,
      amount_due_cents: 0,
      fulfillment,
    });
  }

  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) {
    if (reservationId) {
      await admin.rpc('marketing_credit_finalize', {
        p_reservation_id: reservationId,
        p_action: 'release',
        p_detail: { reason: 'stripe_not_configured' },
      });
    }
    return reply(req, 503, { error: 'Stripe campaign billing is not configured', code: 'STRIPE_NOT_CONFIGURED' });
  }

  const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 8);
  const metadata = {
    product: 'watchdog_marketing_campaign',
    watchdog_user_id: user.id,
    campaign_id: String(quote.campaign_id),
    quote_id: String(quote.id),
    channel: String(quote.channel || ''),
    provider_key: String(quote.provider_key || ''),
    product_type: product,
    size_label: sizeLabel,
    mail_class: mailClass,
    credit_reservation_id: String(reservationId || ''),
    credit_applied_cents: String(creditCents),
    retail_cents: String(quote.retail_cents),
    amount_due_cents: String(amountDue),
  };

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      client_reference_id: user.id,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: amountDue,
          product_data: {
            name: `Watchdog Direct Mail: ${clean(campaign.name, 100)}`,
            description: `${Number(quote.quantity || 0).toLocaleString()} 6 x 8.5 First Class postcards${creditCents ? ` · $${(creditCents / 100).toFixed(2)} member credit applied` : ''}`,
          },
        },
      }],
      success_url: `https://njpropertytaxrelief.com/property/marketing-studio/review?campaign=${encodeURIComponent(String(quote.campaign_id))}&payment=success`,
      cancel_url: `https://njpropertytaxrelief.com/property/marketing-studio/review?campaign=${encodeURIComponent(String(quote.campaign_id))}&payment=cancelled`,
      metadata,
      payment_intent_data: { metadata },
      integration_identifier: `watchdog_campaign_${suffix}`,
    }, { idempotencyKey });
  } catch (error) {
    if (reservationId) {
      await admin.rpc('marketing_credit_finalize', {
        p_reservation_id: reservationId,
        p_action: 'release',
        p_detail: { reason: 'stripe_checkout_failed' },
      });
    }
    console.error('MARKETING_STRIPE_CHECKOUT_ERROR', error);
    return reply(req, 502, { error: error instanceof Error ? error.message : 'Could not create campaign checkout' });
  }

  if (!session.url) {
    if (reservationId) {
      await admin.rpc('marketing_credit_finalize', {
        p_reservation_id: reservationId,
        p_action: 'release',
        p_detail: { reason: 'stripe_url_missing' },
      });
    }
    return reply(req, 502, { error: 'Stripe did not return a checkout URL' });
  }

  const paymentRow = {
    user_id: user.id,
    campaign_id: quote.campaign_id,
    quote_id: quote.id,
    processor: 'stripe',
    processor_payment_id: session.id,
    amount_cents: Number(quote.retail_cents),
    status: 'pending',
    idempotency_key: idempotencyKey,
    metadata: {
      checkout_url: session.url,
      checkout_session_id: session.id,
      channel: quote.channel,
      provider_key: quote.provider_key,
      quantity: quote.quantity,
      ...creditMeta,
    },
  };
  const saved = existing.data
    ? await admin.from('marketing_payments').update(paymentRow).eq('id', existing.data.id).select('id').single()
    : await admin.from('marketing_payments').insert(paymentRow).select('id').single();
  if (saved.error) {
    if (reservationId) {
      await admin.rpc('marketing_credit_finalize', {
        p_reservation_id: reservationId,
        p_action: 'release',
        p_detail: { reason: 'payment_ledger_failed' },
      });
    }
    return reply(req, 503, { error: 'Campaign payment ledger could not be created' });
  }

  if (reservationId) {
    await admin.rpc('marketing_credit_bind_session', { p_reservation_id: reservationId, p_session_id: session.id });
  }
  await admin.from('marketing_campaigns').update({ status: 'payment_pending', updated_at: new Date().toISOString() }).eq('id', quote.campaign_id).eq('user_id', user.id);
  await admin.from('marketing_events').insert({
    user_id: user.id,
    campaign_id: quote.campaign_id,
    event_type: 'payment.checkout_created',
    source: 'stripe',
    payload: {
      payment_id: saved.data.id,
      quote_id: quote.id,
      session_id: session.id,
      amount_cents: quote.retail_cents,
      credit_applied_cents: creditCents,
      amount_due_cents: amountDue,
      product_type: product,
      size_label: sizeLabel,
      mail_class: mailClass,
    },
  });

  return reply(req, 200, {
    url: session.url,
    session_id: session.id,
    payment_id: saved.data.id,
    amount_cents: quote.retail_cents,
    quote_id: quote.id,
    credit_applied_cents: creditCents,
    amount_due_cents: amountDue,
    product_type: product,
    size_label: sizeLabel,
    mail_class: mailClass,
  });
});
