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

async function stripeGet(pathname) {
  const { response, payload } = await jsonFetch(`https://api.stripe.com/v1${pathname}`, {
    headers: { Authorization: `Bearer ${stripeKey}` }
  });
  if (!response.ok) fail(`Stripe GET ${pathname} failed: ${payload?.error?.message || response.status}`);
  return payload;
}

async function stripeDelete(pathname) {
  const { response, payload } = await jsonFetch(`https://api.stripe.com/v1${pathname}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${stripeKey}` }
  });
  if (!response.ok) fail(`Stripe DELETE ${pathname} failed: ${payload?.error?.message || response.status}`);
  return payload;
}

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

const stripeSessionBefore = await stripeGet(`/checkout/sessions/${encodeURIComponent(checkout.payload.session_id)}?expand[]=line_items`);
assert(stripeSessionBefore.livemode === false, 'Stripe Checkout Session unexpectedly reports livemode=true.');
assert(stripeSessionBefore.mode === 'subscription', 'Stripe Checkout Session is not subscription mode.');
assert(stripeSessionBefore.client_reference_id === userId, 'Checkout client_reference_id does not match controlled staging user.');
assert(stripeSessionBefore.metadata?.billing_tier === 'agent', 'Checkout metadata does not identify Agent tier.');
assert(stripeSessionBefore.metadata?.billing_interval === 'monthly', 'Checkout metadata does not identify monthly cadence.');
assert(Number(stripeSessionBefore.amount_total) === 5900, `Agent monthly test Checkout total expected 5900 cents; found ${stripeSessionBefore.amount_total}.`);

fs.mkdirSync(evidenceDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(checkout.payload.url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  async function checkoutDiagnostics() {
    const frames = [];
    for (const frame of page.frames()) {
      const inputs = await frame.locator('input').evaluateAll(nodes => nodes.map(node => ({
        type: node.getAttribute('type'),
        name: node.getAttribute('name'),
        autocomplete: node.getAttribute('autocomplete'),
        placeholder: node.getAttribute('placeholder'),
        aria_label: node.getAttribute('aria-label'),
        radio_label: node.getAttribute('type') === 'radio'
          ? (node.closest('label')?.innerText || node.parentElement?.innerText || '').trim().slice(0, 120)
          : null
      })).slice(0, 30)).catch(() => []);
      frames.push({
        url_host: (() => { try { return new URL(frame.url()).hostname; } catch { return ''; } })(),
        input_count: inputs.length,
        inputs
      });
    }
    return frames;
  }

  async function findVisible(selectors, label, required = true, timeoutMs = 30000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      for (const frame of page.frames()) {
        for (const selector of selectors) {
          const locator = frame.locator(selector).first();
          if (!await locator.count()) continue;
          if (await locator.isVisible().catch(() => false)) return locator;
        }
      }
      await delay(400);
    }

    if (!required) return null;
    const diagnostics = await checkoutDiagnostics();
    fs.writeFileSync(
      path.join(evidenceDir, 'stripe-checkout-dom-diagnostic.json'),
      JSON.stringify({ generated_at: new Date().toISOString(), label, frames: diagnostics }, null, 2)
    );
    fail(`Stripe Checkout field not found after ${timeoutMs}ms: ${label}`);
  }

  async function selectCardPaymentMethod(timeoutMs = 15000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      for (const frame of page.frames()) {
        const radio = frame.getByRole('radio', { name: /card/i }).first();
        if (await radio.count() && await radio.isVisible().catch(() => false)) {
          const checked = await radio.isChecked().catch(() => false);
          if (!checked) {
            await radio.check({ force: true }).catch(async () => {
              await radio.click({ force: true });
            });
          }
          await delay(900);
          return true;
        }
      }
      await delay(300);
    }
    return false;
  }

  async function fill(selectors, label, value, required = true) {
    const locator = await findVisible(selectors, label, required);
    if (!locator) return;
    await locator.fill(value);
  }

  const cardSelected = await selectCardPaymentMethod();
  if (!cardSelected) {
    const diagnostics = await checkoutDiagnostics();
    fs.writeFileSync(
      path.join(evidenceDir, 'stripe-checkout-dom-diagnostic.json'),
      JSON.stringify({ generated_at: new Date().toISOString(), label: 'card payment method', frames: diagnostics }, null, 2)
    );
    fail('Stripe Checkout Card payment method was not found.');
  }

  await fill([
    'input[name="cardNumber"]',
    'input[name="number"]',
    'input[autocomplete="cc-number"]',
    'input[aria-label*="card number" i]',
    'input[placeholder*="card number" i]'
  ], 'card number', '4242424242424242');

  await fill([
    'input[name="cardExpiry"]',
    'input[name="expiry"]',
    'input[autocomplete="cc-exp"]',
    'input[aria-label*="expir" i]',
    'input[placeholder*="MM / YY" i]',
    'input[placeholder*="MM/YY" i]'
  ], 'card expiry', '1234');

  await fill([
    'input[name="cardCvc"]',
    'input[name="cvc"]',
    'input[autocomplete="cc-csc"]',
    'input[aria-label*="security code" i]',
    'input[aria-label*="cvc" i]',
    'input[placeholder*="CVC" i]'
  ], 'card CVC', '123');

  await fill([
    'input[name="billingName"]',
    'input[autocomplete="cc-name"]',
    'input[aria-label*="name on card" i]'
  ], 'billing name', 'Watchdog Staging', false, 5000);

  await fill([
    'input[name="billingPostalCode"]',
    'input[autocomplete="postal-code"]',
    'input[aria-label*="postal" i]',
    'input[aria-label*="zip" i]'
  ], 'billing postal code', '08091', false, 5000);

  const submit = await findVisible([
    'button[type="submit"]',
    'button:has-text("Subscribe")',
    'button:has-text("Pay")'
  ], 'Checkout submit button', true, 30000);
  await submit.click();
  await page.waitForURL(url => url.toString().includes('/property/account') && url.toString().includes('checkout=success'), { timeout: 90000 });
} finally {
  await browser.close();
}

async function pollEntitlement(predicate, label, timeoutMs = 90000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await entitlement();
    if (predicate(last)) return { value: last, elapsed_ms: Date.now() - started };
    await delay(2000);
  }
  fail(`${label} did not arrive before timeout. Last entitlement: ${JSON.stringify(last)}`);
}

const granted = await pollEntitlement(
  row => row?.plan_tier === 'agent' && row?.billing_tier === 'agent' && Number(row?.property_capacity) === 25 && ['active', 'trialing', 'past_due'].includes(row?.subscription_status),
  'Signed Stripe webhook Agent grant'
);

const stripeSessionAfter = await stripeGet(`/checkout/sessions/${encodeURIComponent(checkout.payload.session_id)}?expand[]=subscription`);
const subscriptionId = typeof stripeSessionAfter.subscription === 'string' ? stripeSessionAfter.subscription : stripeSessionAfter.subscription?.id;
assert(subscriptionId, 'Completed Checkout has no subscription ID.');

// Immediate test-mode cleanup also proves the signed customer.subscription.deleted
// path returns access to Standard. Scheduled Portal cancellation is covered by the
// broader lifecycle workflow, not this fast preflight.
await stripeDelete(`/subscriptions/${encodeURIComponent(subscriptionId)}`);
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
  subscription_tag: tag(subscriptionId),
  checkout: { tier: 'agent', cadence: 'monthly', amount_cents: 5900, completed: true },
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
console.log('Stripe staging Checkout preflight PASSED: test-mode Agent purchase -> signed entitlement grant -> signed cancellation downgrade.');
