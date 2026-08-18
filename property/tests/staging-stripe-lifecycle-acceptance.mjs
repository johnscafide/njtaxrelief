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

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
  return { response, payload };
}

async function stripeRequest(method, pathname, entries = []) {
  const options = { method, headers: { Authorization: `Bearer ${stripeKey}` } };
  if (method !== 'GET' && method !== 'DELETE') {
    const body = new URLSearchParams();
    for (const [key, value] of entries) body.append(key, String(value));
    options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    options.body = body;
  }
  const { response, payload } = await jsonFetch(`https://api.stripe.com/v1${pathname}`, options);
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
    await delay(1500);
  }
  fail(`${label} did not arrive before timeout. Last entitlement: ${JSON.stringify(last)}`);
}

const before = await entitlement();
assert(before?.plan_tier === 'standard', `Controlled lifecycle fixture must begin Standard; found ${before?.plan_tier || 'none'}.`);

// Validate Watchdog's hosted Checkout integration without trying to defeat
// Stripe's human-verification challenge. The session itself is authoritative
// for configured product, price, metadata and environment mode.
const checkout = await jsonFetch(`${supabaseUrl}/functions/v1/create-checkout-session`, {
  method: 'POST',
  headers: {
    apikey: publishableKey,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ tier: 'agent', cadence: 'monthly' })
});
if (!checkout.response.ok) {
  fail(`Staging Checkout creation failed (${checkout.response.status} ${checkout.payload?.code || ''}): ${checkout.payload?.error || 'unknown error'}`);
}
assert(checkout.payload?.provider === 'stripe', 'Checkout provider was not Stripe.');
assert(checkout.payload?.destination === 'checkout', 'Checkout did not create a hosted Checkout destination.');
assert(checkout.payload?.stripe_mode === 'test', 'Checkout was not explicitly in Stripe test mode.');
assert(checkout.payload?.url && checkout.payload?.session_id, 'Checkout response missing URL/session ID.');

const checkoutSession = await stripeGet(`/checkout/sessions/${encodeURIComponent(checkout.payload.session_id)}?expand[]=line_items`);
assert(checkoutSession.livemode === false, 'Stripe Checkout Session unexpectedly reports livemode=true.');
assert(checkoutSession.mode === 'subscription', 'Stripe Checkout Session is not subscription mode.');
assert(checkoutSession.client_reference_id === userId, 'Checkout client_reference_id does not match controlled staging user.');
assert(checkoutSession.metadata?.billing_tier === 'agent', 'Checkout metadata does not identify Agent tier.');
assert(checkoutSession.metadata?.billing_interval === 'monthly', 'Checkout metadata does not identify monthly cadence.');
assert(Number(checkoutSession.amount_total) === 5900, `Agent monthly test Checkout total expected 5900 cents; found ${checkoutSession.amount_total}.`);
const agentMonthlyPriceId = checkoutSession.line_items?.data?.[0]?.price?.id || checkoutSession.line_items?.data?.[0]?.price;
assert(agentMonthlyPriceId, 'Checkout Session did not expose its Agent monthly Price ID.');

let testCustomer = null;
let testSubscription = null;
fs.mkdirSync(evidenceDir, { recursive: true });
try {
  // Use Stripe's test token to create a disposable card source on this exact
  // test account. Do not depend on convenience PaymentMethod IDs such as
  // pm_card_visa, which are not guaranteed to resolve in every test account.
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
  const testSourceId = typeof testCustomer.default_source === 'string'
    ? testCustomer.default_source
    : testCustomer.default_source?.id;
  assert(testSourceId, 'Stripe test Customer did not receive a default card source from tok_visa.');

  testSubscription = await stripePost('/subscriptions', [
    ['customer', testCustomer.id],
    ['items[0][price]', agentMonthlyPriceId],
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
  assert(testSubscription?.id, 'Stripe test subscription was not created.');
  assert(testSubscription.livemode === false, 'Stripe test subscription unexpectedly reports livemode=true.');
  assert(['active', 'trialing'].includes(testSubscription.status), `Stripe test subscription expected active/trialing; found ${testSubscription.status}.`);

  const granted = await pollEntitlement(
    row => row?.plan_tier === 'agent' && row?.billing_tier === 'agent' && Number(row?.property_capacity) === 25 && ['active', 'trialing', 'past_due'].includes(row?.subscription_status),
    'Signed Stripe webhook Agent grant'
  );

  await stripeDelete(`/subscriptions/${encodeURIComponent(testSubscription.id)}`);
  const canceled = await pollEntitlement(
    row => row?.plan_tier === 'standard' && row?.subscription_status === 'canceled',
    'Signed Stripe cancellation downgrade'
  );

  const evidence = {
    generated_at: new Date().toISOString(),
    environment: 'staging',
    supabase_ref: stagingRef,
    stripe_mode: 'test',
    controlled_user_tag: tag(userId),
    checkout_session_tag: tag(checkout.payload.session_id),
    customer_tag: tag(testCustomer.id),
    subscription_tag: tag(testSubscription.id),
    checkout_session: {
      tier: 'agent',
      cadence: 'monthly',
      amount_cents: 5900,
      mode: checkoutSession.mode,
      status: checkoutSession.status,
      payment_status: checkoutSession.payment_status,
      hosted_url_present: Boolean(checkout.payload.url),
      browser_submit_not_automated_due_to_stripe_human_verification: true
    },
    api_lifecycle: {
      created_subscription_status: testSubscription.status,
      payment_fixture: 'tok_visa_customer_source',
      disposable_source_created: true
    },
    grant: {
      plan_tier: granted.value.plan_tier,
      billing_tier: granted.value.billing_tier,
      subscription_status: granted.value.subscription_status,
      property_capacity: granted.value.property_capacity,
      webhook_wait_ms: granted.elapsed_ms
    },
    cleanup: {
      plan_tier: canceled.value.plan_tier,
      subscription_status: canceled.value.subscription_status,
      webhook_wait_ms: canceled.elapsed_ms
    }
  };
  fs.writeFileSync(path.join(evidenceDir, 'stripe-lifecycle-preflight.json'), JSON.stringify(evidence, null, 2));
  console.log('Stripe staging lifecycle PASSED: Checkout Session verified; test subscription -> signed Agent grant -> signed cancellation downgrade.');
} finally {
  if (testSubscription?.id) {
    await stripeDelete(`/subscriptions/${encodeURIComponent(testSubscription.id)}`).catch(() => null);
  }
  if (testCustomer?.id) {
    await stripeDelete(`/customers/${encodeURIComponent(testCustomer.id)}`).catch(() => null);
  }
}
