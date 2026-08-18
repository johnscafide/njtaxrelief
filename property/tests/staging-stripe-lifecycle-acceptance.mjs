import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PRODUCTION_REF = 'uvkvaxljhhngydvlrzom';
const EXPECTED_STAGING_REF = 'pxossnwmrygxlpxtstnl';
const supabaseUrl = String(process.env.STAGING_SUPABASE_URL || '').replace(/\/$/, '');
const publishableKey = String(process.env.STAGING_SUPABASE_PUBLISHABLE_KEY || '');
const email = String(process.env.WATCHDOG_TEST_STANDARD_EMAIL || '');
const password = String(process.env.WATCHDOG_TEST_STANDARD_PASSWORD || '');
const stripeKey = String(process.env.STRIPE_TEST_SECRET_KEY || '');
const evidenceDir = process.env.BILLING_EVIDENCE_DIR || 'billing-staging-evidence';
const provisionPath = process.env.STRIPE_PROVISION_OUTPUT || '/tmp/watchdog-stripe-staging-provision.json';

function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function tag(value) { return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 12); }
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

assert(supabaseUrl.startsWith('https://'), 'Missing/invalid STAGING_SUPABASE_URL.');
const stagingRef = new URL(supabaseUrl).hostname.split('.')[0];
assert(stagingRef === EXPECTED_STAGING_REF, `Expected staging ref ${EXPECTED_STAGING_REF}; got ${stagingRef || 'unknown'}.`);
assert(stagingRef !== PRODUCTION_REF, 'Refusing billing acceptance against production Supabase.');
assert(publishableKey.length > 20, 'Missing STAGING_SUPABASE_PUBLISHABLE_KEY.');
assert(email && password, 'Missing controlled staging test credentials.');
assert(stripeKey.startsWith('sk_test_'), 'STRIPE_TEST_SECRET_KEY must be a Stripe test/Sandbox key.');
assert(fs.existsSync(provisionPath), 'Missing Stripe staging provisioning output.');

const provision = JSON.parse(fs.readFileSync(provisionPath, 'utf8'));
assert(provision?.mode === 'test', 'Provisioning output is not test mode.');
assert(provision?.staging_ref === EXPECTED_STAGING_REF, 'Provisioning output targets the wrong Supabase project.');
const webhookUrl = String(provision?.webhook?.url || '');
const webhookSecret = String(provision?.webhook?.signing_secret || '');
assert(webhookUrl === `${supabaseUrl}/functions/v1/stripe-webhook`, 'Provisioned webhook URL does not match staging.');
assert(webhookSecret.startsWith('whsec_'), 'Missing staging webhook signing secret in protected provisioning output.');

const planMatrix = {
  agent_monthly: { tier: 'agent', cadence: 'monthly', amount: 5900, capacity: 25 },
  agent_yearly: { tier: 'agent', cadence: 'yearly', amount: 59000, capacity: 25 },
  pro_monthly: { tier: 'pro', cadence: 'monthly', amount: 12900, capacity: 250 },
  pro_yearly: { tier: 'pro', cadence: 'yearly', amount: 129000, capacity: 250 },
  pro_plus_monthly: { tier: 'pro_plus', cadence: 'monthly', amount: 39900, capacity: 2500 },
  pro_plus_yearly: { tier: 'pro_plus', cadence: 'yearly', amount: 399000, capacity: 2500 }
};
for (const [key, expected] of Object.entries(planMatrix)) {
  expected.priceId = provision?.prices?.[key];
  assert(expected.priceId?.startsWith('price_'), `Missing provisioned ${key} test Price ID.`);
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
  return { response, payload, text };
}

async function stripeRequestRaw(method, pathname, entries = []) {
  const options = { method, headers: { Authorization: `Bearer ${stripeKey}` } };
  if (method !== 'GET' && method !== 'DELETE') {
    const body = new URLSearchParams();
    for (const [key, value] of entries) body.append(key, String(value));
    options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    options.body = body;
  }
  return jsonFetch(`https://api.stripe.com/v1${pathname}`, options);
}
async function stripeRequest(method, pathname, entries = []) {
  const { response, payload } = await stripeRequestRaw(method, pathname, entries);
  if (!response.ok) fail(`Stripe ${method} ${pathname} failed: ${payload?.error?.message || response.status}`);
  return payload;
}
const stripeGet = pathname => stripeRequest('GET', pathname);
const stripePost = (pathname, entries) => stripeRequest('POST', pathname, entries);
const stripeDelete = pathname => stripeRequest('DELETE', pathname);

const login = await jsonFetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
});
assert(login.response.ok, `Staging sign-in failed (${login.response.status}).`);
const accessToken = login.payload?.access_token;
const userId = login.payload?.user?.id;
assert(accessToken && userId, 'Staging sign-in returned no access token/user ID.');

async function entitlement() {
  const { response, payload } = await jsonFetch(`${supabaseUrl}/rest/v1/rpc/get_my_entitlement`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: '{}'
  });
  assert(response.ok, `get_my_entitlement failed (${response.status}).`);
  return Array.isArray(payload) ? payload[0] : payload;
}

async function pollEntitlement(predicate, label, timeoutMs = 90000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await entitlement();
    if (predicate(last)) return { value: last, elapsed_ms: Date.now() - started };
    await delay(1000);
  }
  fail(`${label} did not arrive before timeout. Last entitlement: ${JSON.stringify(last)}`);
}

async function findStripeEvent(type, objectId, createdAfter, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const events = await stripeGet(`/events?type=${encodeURIComponent(type)}&created[gte]=${Math.max(0, createdAfter - 3)}&limit=30`);
    const match = events?.data?.find(event => event?.data?.object?.id === objectId);
    if (match) return match;
    await delay(800);
  }
  fail(`Stripe event ${type} for ${tag(objectId)} was not found.`);
}

async function deliverSignedEvent(event) {
  const payload = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto.createHmac('sha256', webhookSecret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  const { response, text } = await jsonFetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': `t=${timestamp},v1=${signature}`
    },
    body: payload
  });
  assert(response.ok, `Signed webhook replay failed (${response.status}): ${text.slice(0, 180)}`);
  return text.trim();
}

async function assureStripeEvent(type, objectId, createdAfter) {
  const event = await findStripeEvent(type, objectId, createdAfter);
  const delivery = await deliverSignedEvent(event);
  return { event, delivery };
}

async function validateCheckout(key) {
  const expected = planMatrix[key];
  const checkout = await jsonFetch(`${supabaseUrl}/functions/v1/create-checkout-session`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ tier: expected.tier, cadence: expected.cadence })
  });
  if (!checkout.response.ok) {
    fail(`Staging Checkout ${key} failed (${checkout.response.status} ${checkout.payload?.code || ''}): ${checkout.payload?.error || 'unknown error'}`);
  }
  assert(checkout.payload?.provider === 'stripe', `${key}: Checkout provider was not Stripe.`);
  assert(checkout.payload?.destination === 'checkout', `${key}: Checkout destination was not hosted Checkout.`);
  assert(checkout.payload?.stripe_mode === 'test', `${key}: Checkout was not explicitly in Stripe test mode.`);
  assert(checkout.payload?.url && checkout.payload?.session_id, `${key}: Checkout response missing URL/session ID.`);

  const session = await stripeGet(`/checkout/sessions/${encodeURIComponent(checkout.payload.session_id)}?expand[]=line_items`);
  assert(session.livemode === false, `${key}: Checkout Session unexpectedly reports livemode=true.`);
  assert(session.mode === 'subscription', `${key}: Checkout Session is not subscription mode.`);
  assert(session.client_reference_id === userId, `${key}: Checkout client_reference_id mismatch.`);
  assert(session.metadata?.billing_tier === expected.tier, `${key}: Checkout tier metadata mismatch.`);
  assert(session.metadata?.billing_interval === expected.cadence, `${key}: Checkout cadence metadata mismatch.`);
  assert(Number(session.amount_total) === expected.amount, `${key}: expected ${expected.amount} cents; found ${session.amount_total}.`);
  const sessionPriceId = session.line_items?.data?.[0]?.price?.id || session.line_items?.data?.[0]?.price;
  assert(sessionPriceId === expected.priceId, `${key}: Checkout used an unexpected Stripe Price.`);
  await stripePost(`/checkout/sessions/${encodeURIComponent(session.id)}/expire`, []).catch(() => null);
  return { sessionTag: tag(session.id), priceTag: tag(sessionPriceId), amount: expected.amount };
}

const before = await entitlement();
assert(before?.plan_tier === 'standard', `Controlled lifecycle fixture must begin Standard; found ${before?.plan_tier || 'none'}.`);

fs.mkdirSync(evidenceDir, { recursive: true });
const evidence = {
  generated_at: new Date().toISOString(),
  environment: 'staging',
  supabase_ref: stagingRef,
  stripe_mode: 'test',
  controlled_user_tag: tag(userId),
  checkout_catalog: {},
  transitions: [],
  failure_recovery: null,
  refund: null,
  idempotency: null,
  stale_event: null,
  cleanup: null
};

// Verify all six customer-facing Checkout choices before creating an active subscription.
for (const key of Object.keys(planMatrix)) {
  evidence.checkout_catalog[key] = await validateCheckout(key);
}

let testCustomer = null;
let testSubscription = null;
let recoveryInvoice = null;
let latestTransitionEvent = null;
let proPlusEventForStaleTest = null;
try {
  testCustomer = await stripePost('/customers', [
    ['email', email],
    ['name', 'Watchdog Staging Billing Acceptance'],
    ['source', 'tok_visa'],
    ['metadata[supabase_user_id]', userId],
    ['metadata[watchdog_user_id]', userId],
    ['metadata[watchdog_environment]', 'staging_test'],
    ['metadata[purpose]', 'billing_acceptance']
  ]);
  assert(testCustomer?.id && testCustomer.livemode === false, 'Stripe test Customer was not created safely in test mode.');
  let testSourceId = typeof testCustomer.default_source === 'string'
    ? testCustomer.default_source
    : testCustomer.default_source?.id;
  assert(testSourceId, 'Stripe test Customer did not receive a default card source from tok_visa.');

  const createStarted = Math.floor(Date.now() / 1000);
  testSubscription = await stripePost('/subscriptions', [
    ['customer', testCustomer.id],
    ['items[0][price]', planMatrix.agent_monthly.priceId],
    ['default_source', testSourceId],
    ['collection_method', 'charge_automatically'],
    ['payment_behavior', 'error_if_incomplete'],
    ['metadata[supabase_user_id]', userId],
    ['metadata[watchdog_user_id]', userId],
    ['metadata[product]', 'watchdog_subscription'],
    ['metadata[billing_tier]', 'agent'],
    ['metadata[plan_tier]', 'agent'],
    ['metadata[billing_interval]', 'monthly'],
    ['metadata[property_capacity]', '25'],
    ['metadata[watchdog_environment]', 'staging_test']
  ]);
  assert(testSubscription?.id && testSubscription.livemode === false, 'Stripe test subscription was not created safely.');
  assert(['active', 'trialing'].includes(testSubscription.status), `Initial subscription expected active/trialing; found ${testSubscription.status}.`);
  const subscriptionItemId = testSubscription.items?.data?.[0]?.id;
  assert(subscriptionItemId, 'Stripe subscription did not return a subscription item ID.');

  const createdAssured = await assureStripeEvent('customer.subscription.created', testSubscription.id, createStarted);
  latestTransitionEvent = createdAssured.event;
  let granted = await pollEntitlement(
    row => row?.plan_tier === 'agent' && row?.billing_tier === 'agent' && Number(row?.property_capacity) === 25 && ['active', 'trialing', 'past_due'].includes(row?.subscription_status),
    'Signed Stripe webhook Agent monthly grant'
  );
  evidence.transitions.push({
    step: 'standard_to_agent_monthly',
    plan_tier: granted.value.plan_tier,
    capacity: granted.value.property_capacity,
    webhook_wait_ms: granted.elapsed_ms,
    event_tag: tag(createdAssured.event.id),
    replay_result: createdAssured.delivery
  });

  async function transition(key, label) {
    const expected = planMatrix[key];
    await delay(1100);
    const started = Math.floor(Date.now() / 1000);
    testSubscription = await stripePost(`/subscriptions/${encodeURIComponent(testSubscription.id)}`, [
      ['items[0][id]', subscriptionItemId],
      ['items[0][price]', expected.priceId],
      ['proration_behavior', 'none'],
      ['metadata[billing_tier]', expected.tier],
      ['metadata[plan_tier]', expected.tier],
      ['metadata[billing_interval]', expected.cadence],
      ['metadata[property_capacity]', expected.capacity]
    ]);
    const item = testSubscription.items?.data?.[0];
    assert((item?.price?.id || item?.price) === expected.priceId, `${label}: Stripe subscription did not adopt expected Price.`);
    const assured = await assureStripeEvent('customer.subscription.updated', testSubscription.id, started);
    latestTransitionEvent = assured.event;
    if (key === 'pro_plus_yearly') proPlusEventForStaleTest = assured.event;
    const state = await pollEntitlement(
      row => row?.plan_tier === expected.tier && row?.billing_tier === expected.tier && Number(row?.property_capacity) === expected.capacity && ['active', 'trialing', 'past_due'].includes(row?.subscription_status),
      `Signed Stripe webhook ${label}`
    );
    evidence.transitions.push({
      step: label,
      tier: expected.tier,
      cadence: expected.cadence,
      amount_cents: expected.amount,
      capacity: state.value.property_capacity,
      webhook_wait_ms: state.elapsed_ms,
      event_tag: tag(assured.event.id),
      replay_result: assured.delivery
    });
  }

  await transition('agent_yearly', 'agent_monthly_to_yearly');
  await transition('pro_monthly', 'agent_yearly_to_pro_monthly');
  await transition('pro_yearly', 'pro_monthly_to_yearly');
  await transition('pro_plus_monthly', 'pro_yearly_to_pro_plus_monthly');
  await transition('pro_plus_yearly', 'pro_plus_monthly_to_yearly');
  await transition('pro_monthly', 'pro_plus_yearly_to_pro_monthly');
  await transition('agent_monthly', 'pro_monthly_to_agent_monthly');

  // Duplicate delivery must be harmless. Replaying an already-processed real event
  // exercises the billing_webhook_events idempotency key.
  const duplicateFirst = await deliverSignedEvent(latestTransitionEvent);
  const duplicateSecond = await deliverSignedEvent(latestTransitionEvent);
  assert(duplicateSecond === 'Already processed', `Duplicate webhook did not return idempotent acknowledgement: ${duplicateSecond}`);
  const afterDuplicate = await entitlement();
  assert(afterDuplicate?.plan_tier === 'agent' && Number(afterDuplicate?.property_capacity) === 25, 'Duplicate webhook changed effective entitlement.');
  evidence.idempotency = {
    event_tag: tag(latestTransitionEvent.id),
    first_replay: duplicateFirst,
    second_replay: duplicateSecond,
    effective_plan: afterDuplicate.plan_tier
  };

  // Stale/out-of-order protection: replay Pro+ subscription data under a new
  // event ID but with an event.created timestamp safely older than the current
  // Agent event. Without provider_event_at ordering protection this would
  // incorrectly re-grant Pro+.
  assert(proPlusEventForStaleTest, 'Missing Pro+ event fixture for stale-order test.');
  const staleEvent = structuredClone(proPlusEventForStaleTest);
  staleEvent.id = `evt_watchdog_stale_${Date.now()}`;
  staleEvent.created = Math.max(1, Number(latestTransitionEvent.created || Math.floor(Date.now() / 1000)) - 60);
  const staleDelivery = await deliverSignedEvent(staleEvent);
  await delay(700);
  const afterStale = await entitlement();
  assert(afterStale?.plan_tier === 'agent' && Number(afterStale?.property_capacity) === 25, 'Stale subscription event changed effective entitlement.');
  evidence.stale_event = {
    stale_event_tag: tag(staleEvent.id),
    stale_payload_tier: 'pro_plus',
    delivery: staleDelivery,
    preserved_effective_plan: afterStale.plan_tier,
    preserved_capacity: afterStale.property_capacity
  };

  // Revenue-recovery signal test. This invoice is intentionally separate from
  // the subscription so it exercises invoice.payment_failed / invoice.paid
  // without destroying the active paid entitlement used by the matrix.
  testCustomer = await stripePost(`/customers/${encodeURIComponent(testCustomer.id)}`, [['source', 'tok_chargeDeclined']]);
  const declinedSourceId = typeof testCustomer.default_source === 'string'
    ? testCustomer.default_source
    : testCustomer.default_source?.id;
  assert(declinedSourceId, 'Decline test source was not attached to Stripe test customer.');

  await stripePost('/invoiceitems', [
    ['customer', testCustomer.id],
    ['amount', '123'],
    ['currency', 'usd'],
    ['description', 'Watchdog staging revenue-recovery acceptance'],
    ['metadata[purpose]', 'billing_acceptance_recovery']
  ]);
  recoveryInvoice = await stripePost('/invoices', [
    ['customer', testCustomer.id],
    ['collection_method', 'charge_automatically'],
    ['auto_advance', 'false'],
    ['pending_invoice_items_behavior', 'include'],
    ['metadata[purpose]', 'billing_acceptance_recovery']
  ]);
  recoveryInvoice = await stripePost(`/invoices/${encodeURIComponent(recoveryInvoice.id)}/finalize`, []);
  const failedPayStarted = Math.floor(Date.now() / 1000);
  const failedPay = await stripeRequestRaw('POST', `/invoices/${encodeURIComponent(recoveryInvoice.id)}/pay`, []);
  assert(!failedPay.response.ok || failedPay.payload?.status !== 'paid', 'Decline fixture unexpectedly paid the recovery invoice.');
  const failedAssured = await assureStripeEvent('invoice.payment_failed', recoveryInvoice.id, failedPayStarted);
  const afterFailure = await entitlement();
  assert(afterFailure?.plan_tier === 'agent', 'Invoice failure unexpectedly revoked an otherwise active subscription immediately.');

  testCustomer = await stripePost(`/customers/${encodeURIComponent(testCustomer.id)}`, [['source', 'tok_visa']]);
  testSourceId = typeof testCustomer.default_source === 'string'
    ? testCustomer.default_source
    : testCustomer.default_source?.id;
  assert(testSourceId, 'Recovery Visa test source was not attached.');
  const recoveredStarted = Math.floor(Date.now() / 1000);
  recoveryInvoice = await stripePost(`/invoices/${encodeURIComponent(recoveryInvoice.id)}/pay`, []);
  assert(recoveryInvoice?.status === 'paid' || recoveryInvoice?.paid === true, `Recovery invoice did not become paid; status=${recoveryInvoice?.status}.`);
  const paidAssured = await assureStripeEvent('invoice.paid', recoveryInvoice.id, recoveredStarted);
  const afterRecovery = await entitlement();
  assert(afterRecovery?.plan_tier === 'agent', 'Invoice recovery changed subscription entitlement unexpectedly.');
  evidence.failure_recovery = {
    invoice_tag: tag(recoveryInvoice.id),
    failed_event_tag: tag(failedAssured.event.id),
    failed_replay: failedAssured.delivery,
    effective_plan_during_failure: afterFailure.plan_tier,
    paid_event_tag: tag(paidAssured.event.id),
    paid_replay: paidAssured.delivery,
    effective_plan_after_recovery: afterRecovery.plan_tier
  };

  // Refund observation must be recorded by the subscription billing webhook but
  // must not silently revoke an otherwise active subscription.
  const charges = await stripeGet(`/charges?customer=${encodeURIComponent(testCustomer.id)}&limit=30`);
  const recoveryCharge = charges?.data?.find(charge => charge?.invoice === recoveryInvoice.id && charge?.paid && !charge?.refunded);
  assert(recoveryCharge?.id, 'Could not locate paid recovery charge for refund acceptance.');
  const refundStarted = Math.floor(Date.now() / 1000);
  const refund = await stripePost('/refunds', [['charge', recoveryCharge.id], ['reason', 'requested_by_customer']]);
  assert(refund?.status === 'succeeded', `Stripe test refund did not succeed; status=${refund?.status}.`);
  const refundAssured = await assureStripeEvent('charge.refunded', recoveryCharge.id, refundStarted);
  const afterRefund = await entitlement();
  assert(afterRefund?.plan_tier === 'agent', 'Refund observation unexpectedly revoked active subscription entitlement.');
  evidence.refund = {
    charge_tag: tag(recoveryCharge.id),
    refund_tag: tag(refund.id),
    event_tag: tag(refundAssured.event.id),
    replay_result: refundAssured.delivery,
    effective_plan_after_refund: afterRefund.plan_tier
  };

  const deleteStarted = Math.floor(Date.now() / 1000);
  await stripeDelete(`/subscriptions/${encodeURIComponent(testSubscription.id)}`);
  const deletedAssured = await assureStripeEvent('customer.subscription.deleted', testSubscription.id, deleteStarted);
  const canceled = await pollEntitlement(
    row => row?.plan_tier === 'standard' && row?.subscription_status === 'canceled',
    'Signed Stripe cancellation downgrade'
  );
  evidence.cleanup = {
    deleted_event_tag: tag(deletedAssured.event.id),
    replay_result: deletedAssured.delivery,
    effective_plan: canceled.value.plan_tier,
    subscription_status: canceled.value.subscription_status,
    webhook_wait_ms: canceled.elapsed_ms
  };

  fs.writeFileSync(path.join(evidenceDir, 'stripe-lifecycle-preflight.json'), JSON.stringify(evidence, null, 2));
  console.log('Stripe staging lifecycle PASSED: 6-price Checkout catalog, cadence/plan transitions, failure/recovery, refund, duplicate/stale event safety, cancellation downgrade.');
} finally {
  if (testSubscription?.id) {
    await stripeDelete(`/subscriptions/${encodeURIComponent(testSubscription.id)}`).catch(() => null);
  }
  if (recoveryInvoice?.id && recoveryInvoice?.status === 'open') {
    await stripePost(`/invoices/${encodeURIComponent(recoveryInvoice.id)}/void`, []).catch(() => null);
  }
  if (testCustomer?.id) {
    await stripeDelete(`/customers/${encodeURIComponent(testCustomer.id)}`).catch(() => null);
  }
}
