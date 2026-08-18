import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

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
assert(before?.plan_tier === 'standard', `Controlled checkout fixture must begin Standard; found ${before?.plan_tier || 'none'}.`);

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

const stripeSession = await stripeGet(`/checkout/sessions/${encodeURIComponent(checkout.payload.session_id)}?expand[]=line_items`);
assert(stripeSession.livemode === false, 'Stripe Checkout Session unexpectedly reports livemode=true.');
assert(stripeSession.mode === 'subscription', 'Stripe Checkout Session is not subscription mode.');
assert(stripeSession.client_reference_id === userId, 'Checkout client_reference_id does not match controlled staging user.');
assert(stripeSession.metadata?.billing_tier === 'agent', 'Checkout metadata does not identify Agent tier.');
assert(stripeSession.metadata?.billing_interval === 'monthly', 'Checkout metadata does not identify monthly cadence.');
assert(Number(stripeSession.amount_total) === 5900, `Agent monthly test Checkout total expected 5900 cents; found ${stripeSession.amount_total}.`);
const agentMonthlyPriceId = stripeSession.line_items?.data?.[0]?.price?.id || stripeSession.line_items?.data?.[0]?.price;
assert(agentMonthlyPriceId, 'Checkout Session did not expose its Agent monthly Price ID.');

fs.mkdirSync(evidenceDir, { recursive: true });

// Hosted Checkout browser smoke. We deliberately stop before programmatic
// submission because Stripe may present a human hCaptcha challenge. CI must not
// attempt to bypass Stripe anti-bot controls. The server-side test lifecycle
// below exercises real Stripe test charges and signed webhooks deterministically.
let checkoutSmoke = { card_method: false, card_fields: false, submit_button: false };
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(checkout.payload.url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  async function findVisible(selectors, label, timeoutMs = 30000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      for (const frame of page.frames()) {
        for (const selector of selectors) {
          const locator = frame.locator(selector).first();
          if (await locator.count() && await locator.isVisible().catch(() => false)) return locator;
        }
      }
      await delay(300);
    }
    fail(`Stripe Checkout field not found after ${timeoutMs}ms: ${label}`);
  }

  let cardRadio = null;
  const radioStarted = Date.now();
  while (!cardRadio && Date.now() - radioStarted < 15000) {
    for (const frame of page.frames()) {
      const candidate = frame.getByRole('radio', { name: /card/i }).first();
      if (await candidate.count() && await candidate.isVisible().catch(() => false)) {
        cardRadio = candidate;
        break;
      }
    }
    if (!cardRadio) await delay(300);
  }
  assert(cardRadio, 'Stripe Checkout Card payment method was not found.');
  if (!await cardRadio.isChecked().catch(() => false)) {
    await cardRadio.check({ force: true }).catch(() => cardRadio.click({ force: true }));
    await delay(700);
  }
  checkoutSmoke.card_method = true;

  await findVisible(['input[name="cardNumber"]', 'input[autocomplete="cc-number"]'], 'card number');
  await findVisible(['input[name="cardExpiry"]', 'input[autocomplete="cc-exp"]'], 'card expiry');
  await findVisible(['input[name="cardCvc"]', 'input[autocomplete="cc-csc"]'], 'card CVC');
  checkoutSmoke.card_fields = true;

  await findVisible(['button[type="submit"]', 'button:has-text("Subscribe")', 'button:has-text("Pay")'], 'Checkout submit button');
  checkoutSmoke.submit_button = true;
} finally {
  await browser.close();
}

let testCustomer = null;
let testSubscription = null;
try {
  // Stripe's reusable test PaymentMethod avoids entering raw card data in CI.
  // Creating the subscription still generates the same subscription/invoice
  // webhooks that Watchdog relies on for server-authoritative entitlement state.
  testCustomer = await stripePost('/customers', [
    ['email', email],
    ['name', 'Watchdog Staging Billing Acceptance'],
    ['payment_method', 'pm_card_visa'],
    ['invoice_settings[default_payment_method]', 'pm_card_visa'],
    ['metadata[supabase_user_id]', userId],
    ['metadata[watchdog_user_id]', userId],
    ['metadata[watchdog_environment]', 'staging_test'],
    ['metadata[purpose]', 'billing_acceptance']
  ]);
  assert(testCustomer?.id && testCustomer.livemode === false, 'Stripe test Customer was not created safely in test mode.');

  testSubscription = await stripePost('/subscriptions', [
    ['customer', testCustomer.id],
    ['items[0][price]', agentMonthlyPriceId],
    ['default_payment_method', 'pm_card_visa'],
    ['collection_method', 'charge_automatically'],
    ['payment_behavior', 'error_if_incomplete'],
    ['payment_settings[payment_method_types][]', 'card'],
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
    hosted_checkout_smoke: {
      tier: 'agent',
      cadence: 'monthly',
      amount_cents: 5900,
      session_status: stripeSession.status,
      payment_status: stripeSession.payment_status,
      card_method_rendered: checkoutSmoke.card_method,
      card_fields_rendered: checkoutSmoke.card_fields,
      submit_button_rendered: checkoutSmoke.submit_button,
      automated_submit_skipped_for_human_verification_boundary: true
    },
    api_lifecycle: {
      subscription_status: testSubscription.status,
      payment_method_fixture: 'pm_card_visa'
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
  fs.writeFileSync(path.join(evidenceDir, 'stripe-checkout-preflight.json'), JSON.stringify(evidence, null, 2));
  console.log('Stripe staging preflight PASSED: hosted Checkout rendered correctly; test API subscription -> signed Agent grant -> signed cancellation downgrade.');
} finally {
  if (testSubscription?.id) {
    await stripeDelete(`/subscriptions/${encodeURIComponent(testSubscription.id)}`).catch(() => null);
  }
  if (testCustomer?.id) {
    await stripeDelete(`/customers/${encodeURIComponent(testCustomer.id)}`).catch(() => null);
  }
}
