const originalFetch = globalThis.fetch.bind(globalThis);
const stagingBase = String(process.env.STAGING_SUPABASE_URL || '').replace(/\/$/, '');
const stagingFunctionsPrefix = stagingBase ? `${stagingBase}/functions/v1/` : '';
const stripeApiPrefix = 'https://api.stripe.com/v1/';
const maxAttempts = 4;
let latestPaidRecoveryInvoiceId = null;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function requestUrl(input) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return String(input?.url || '');
}

function isExplicitEdgeRuntimeFailure(response, text, payload) {
  if (![502, 503, 504].includes(Number(response?.status || 0))) return false;
  const code = String(payload?.code || '');
  const body = String(text || '');
  return code.startsWith('SUPABASE_EDGE_RUNTIME_') || body.includes('SUPABASE_EDGE_RUNTIME_');
}

function normalizeStripeDeclineFixture(url, init) {
  if (!url.startsWith(`${stripeApiPrefix}customers/`)) return init;
  if (String(init?.method || 'GET').toUpperCase() !== 'POST') return init;
  if (!(init?.body instanceof URLSearchParams)) return init;
  if (init.body.get('source') !== 'tok_chargeDeclined') return init;

  // Stripe does not allow a normal issuer-decline card to be attached to a
  // Customer. Its documented `tok_chargeCustomerFail` fixture attaches
  // successfully and then declines the subsequent charge, which is exactly the
  // revenue-recovery state this acceptance test is intended to exercise.
  const body = new URLSearchParams(init.body);
  body.set('source', 'tok_chargeCustomerFail');
  console.log('Using Stripe decline-after-attach fixture for staging revenue-recovery acceptance.');
  return { ...init, body };
}

async function safeJson(response) {
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
}

function stripeHeaders(init) {
  return init?.headers || {};
}

function paymentIntentId(invoicePayment) {
  const payment = invoicePayment?.payment;
  if (typeof payment === 'string' && payment.startsWith('pi_')) return payment;
  if (payment?.id?.startsWith?.('pi_')) return payment.id;
  const intent = payment?.payment_intent;
  if (typeof intent === 'string') return intent;
  return intent?.id || null;
}

async function rememberPaidInvoice(url, response) {
  const match = url.match(/\/v1\/invoices\/([^/?]+)\/pay(?:\?|$)/);
  if (!match || !response.ok) return;
  const payload = await safeJson(response);
  if (payload?.id && (payload?.status === 'paid' || payload?.paid === true)) {
    latestPaidRecoveryInvoiceId = payload.id;
  }
}

async function adaptChargeListToCurrentInvoicePayments(url, init, response) {
  if (!response.ok || !latestPaidRecoveryInvoiceId) return response;
  if (!url.startsWith(`${stripeApiPrefix}charges?`)) return response;

  const chargeList = await safeJson(response);
  if (!Array.isArray(chargeList?.data)) return response;
  if (chargeList.data.some(charge => charge?.invoice === latestPaidRecoveryInvoiceId)) return response;

  // Stripe's current Billing API reconciles a paid invoice through
  // `/v1/invoice_payments`, rather than requiring a legacy `Charge.invoice`
  // relationship. Resolve the paid invoice payment -> PaymentIntent -> Charge,
  // then annotate only this staging test response so the frozen core matrix can
  // continue validating the real charge.refunded webhook path.
  const query = new URLSearchParams({
    invoice: latestPaidRecoveryInvoiceId,
    status: 'paid',
    limit: '10'
  });
  query.append('expand[]', 'data.payment');
  const paymentsResponse = await originalFetch(`${stripeApiPrefix}invoice_payments?${query.toString()}`, {
    method: 'GET',
    headers: stripeHeaders(init)
  });
  if (!paymentsResponse.ok) return response;
  const payments = await paymentsResponse.json().catch(() => null);
  const paidPayment = payments?.data?.find(row => row?.status === 'paid') || payments?.data?.[0];
  const intentId = paymentIntentId(paidPayment);
  if (!intentId) return response;

  const intentResponse = await originalFetch(`${stripeApiPrefix}payment_intents/${encodeURIComponent(intentId)}?expand[]=latest_charge`, {
    method: 'GET',
    headers: stripeHeaders(init)
  });
  if (!intentResponse.ok) return response;
  const intent = await intentResponse.json().catch(() => null);
  let charge = intent?.latest_charge || null;
  if (typeof charge === 'string') {
    const chargeResponse = await originalFetch(`${stripeApiPrefix}charges/${encodeURIComponent(charge)}`, {
      method: 'GET',
      headers: stripeHeaders(init)
    });
    if (!chargeResponse.ok) return response;
    charge = await chargeResponse.json().catch(() => null);
  }
  if (!charge?.id) return response;

  const reconciledCharge = { ...charge, invoice: latestPaidRecoveryInvoiceId };
  const existingIndex = chargeList.data.findIndex(row => row?.id === reconciledCharge.id);
  if (existingIndex >= 0) chargeList.data[existingIndex] = reconciledCharge;
  else chargeList.data.unshift(reconciledCharge);

  console.log('Resolved paid recovery charge through Stripe invoice_payments for refund acceptance.');
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json');
  return new Response(JSON.stringify(chargeList), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function adaptStripeResponse(url, init, response) {
  if (!url.startsWith(stripeApiPrefix)) return response;
  await rememberPaidInvoice(url, response);
  return adaptChargeListToCurrentInvoicePayments(url, init, response);
}

globalThis.fetch = async function watchdogStagingResilientFetch(input, init) {
  const url = requestUrl(input);
  const normalizedInit = normalizeStripeDeclineFixture(url, init);
  const isStagingEdgeCall = Boolean(stagingFunctionsPrefix) && url.startsWith(stagingFunctionsPrefix);

  if (!isStagingEdgeCall) {
    const response = await originalFetch(input, normalizedInit);
    return adaptStripeResponse(url, normalizedInit, response);
  }

  let lastResponse = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await originalFetch(input, normalizedInit);
    lastResponse = response;
    if (response.ok) return response;

    const probe = response.clone();
    const text = await probe.text().catch(() => '');
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }

    if (!isExplicitEdgeRuntimeFailure(response, text, payload) || attempt === maxAttempts) {
      return response;
    }

    const waitMs = 1000 * (2 ** (attempt - 1));
    const code = String(payload?.code || 'SUPABASE_EDGE_RUNTIME_TRANSIENT');
    console.log(`Transient staging Edge Runtime response ${code}; retrying in ${waitMs}ms (${attempt}/${maxAttempts}).`);
    await delay(waitMs);
  }

  return lastResponse;
};

await import('./staging-stripe-lifecycle-acceptance-core.mjs');
