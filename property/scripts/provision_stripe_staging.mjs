import fs from 'node:fs';

const PRODUCTION_REF = 'uvkvaxljhhngydvlrzom';
const EXPECTED_STAGING_REF = 'pxossnwmrygxlpxtstnl';
const stripeKey = String(process.env.STRIPE_TEST_SECRET_KEY || '');
const stagingUrl = String(process.env.STAGING_SUPABASE_URL || '').replace(/\/$/, '');
const outputPath = process.env.STRIPE_PROVISION_OUTPUT || '/tmp/watchdog-stripe-staging-provision.json';

function fail(message) {
  console.error(`STRIPE_STAGING_PROVISION_FAILED: ${message}`);
  process.exit(1);
}
function assert(condition, message) { if (!condition) fail(message); }

assert(stripeKey.startsWith('sk_test_'), 'STRIPE_TEST_SECRET_KEY must be a Stripe test/Sandbox secret key (sk_test_...).');
assert(stagingUrl.startsWith('https://'), 'STAGING_SUPABASE_URL must be HTTPS.');
const stagingHost = new URL(stagingUrl).hostname;
const stagingRef = stagingHost.split('.')[0];
assert(stagingRef === EXPECTED_STAGING_REF, `Expected staging project ${EXPECTED_STAGING_REF}; received ${stagingRef || 'unknown'}.`);
assert(stagingRef !== PRODUCTION_REF, 'Refusing to provision Stripe staging against production Supabase.');

const API = 'https://api.stripe.com/v1';
async function stripe(method, path, entries = []) {
  const options = { method, headers: { Authorization: `Bearer ${stripeKey}` } };
  if (method !== 'GET' && method !== 'DELETE') {
    const body = new URLSearchParams();
    for (const [key, value] of entries) body.append(key, String(value));
    options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    options.body = body;
  }
  const response = await fetch(`${API}${path}`, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${path}: ${payload?.error?.message || response.statusText}`);
  return payload;
}

const plans = [
  { tier: 'agent', label: 'Agent', monthly: 5900, yearly: 59000 },
  { tier: 'pro', label: 'Pro', monthly: 12900, yearly: 129000 },
  { tier: 'pro_plus', label: 'Pro+', monthly: 39900, yearly: 399000 }
];

const products = await stripe('GET', '/products?active=true&limit=100');
const prices = await stripe('GET', '/prices?active=true&limit=100');
const result = { mode: 'test', staging_ref: stagingRef, products: {}, prices: {}, webhook: {}, portal: {} };

for (const plan of plans) {
  let product = products.data.find(p => p.metadata?.watchdog_plan === plan.tier && p.metadata?.watchdog_environment === 'staging_test');
  if (!product) {
    product = await stripe('POST', '/products', [
      ['name', `Watchdog ${plan.label} (Staging Test)`],
      ['description', `${plan.label} test/Sandbox plan for Watchdog staging acceptance`],
      ['metadata[watchdog_plan]', plan.tier],
      ['metadata[watchdog_environment]', 'staging_test'],
      ['metadata[catalog_version]', '2026-08-18']
    ]);
  }
  result.products[plan.tier] = product.id;

  for (const cadence of ['monthly', 'yearly']) {
    const lookup = `watchdog_${plan.tier}_${cadence}`;
    const expectedInterval = cadence === 'monthly' ? 'month' : 'year';
    const expectedAmount = plan[cadence];
    let price = prices.data
      .filter(p => p.lookup_key === lookup && p.livemode === false && p.active)
      .sort((a, b) => Number(b.created || 0) - Number(a.created || 0))[0];
    if (price) {
      assert(price.currency === 'usd', `${lookup} exists with non-USD currency.`);
      assert(Number(price.unit_amount) === expectedAmount, `${lookup} amount differs from expected ${expectedAmount}.`);
      assert(price.recurring?.interval === expectedInterval, `${lookup} recurring interval differs from ${expectedInterval}.`);
      assert(price.product === product.id || price.product?.id === product.id, `${lookup} belongs to a different test product.`);
    } else {
      price = await stripe('POST', '/prices', [
        ['currency', 'usd'],
        ['unit_amount', expectedAmount],
        ['recurring[interval]', expectedInterval],
        ['product', product.id],
        ['lookup_key', lookup],
        ['nickname', `Watchdog ${plan.label} ${cadence} (Staging Test)`],
        ['metadata[watchdog_plan]', plan.tier],
        ['metadata[billing_period]', cadence],
        ['metadata[watchdog_environment]', 'staging_test'],
        ['metadata[catalog_version]', '2026-08-18']
      ]);
    }
    result.prices[`${plan.tier}_${cadence}`] = price.id;
  }
}

const webhookUrl = `${stagingUrl}/functions/v1/stripe-webhook`;
const endpoints = await stripe('GET', '/webhook_endpoints?limit=100');
for (const endpoint of endpoints.data.filter(e => e.url === webhookUrl)) {
  // Test/Sandbox only: recreate this Watchdog staging endpoint so the signing
  // secret is known to the provisioning run and can be pushed into Supabase.
  await stripe('DELETE', `/webhook_endpoints/${encodeURIComponent(endpoint.id)}`);
}
const webhookEvents = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'invoice.paid',
  'invoice.payment_failed',
  'charge.refunded'
];
const webhookEntries = [
  ['url', webhookUrl],
  ['description', 'Watchdog staging Stripe subscription acceptance webhook'],
  ['metadata[application]', 'watchdog'],
  ['metadata[environment]', 'staging']
];
for (const event of webhookEvents) webhookEntries.push(['enabled_events[]', event]);
const webhook = await stripe('POST', '/webhook_endpoints', webhookEntries);
assert(webhook.livemode === false, 'Created webhook unexpectedly reports livemode=true.');
assert(webhook.secret?.startsWith('whsec_'), 'Stripe did not return a webhook signing secret for the recreated staging endpoint.');
result.webhook = { id: webhook.id, url: webhook.url, status: webhook.status, signing_secret: webhook.secret };

let portals = await stripe('GET', '/billing_portal/configurations?active=true&limit=100');
let portal = portals.data.find(c => c.features?.subscription_cancel?.enabled && c.features?.payment_method_update?.enabled && c.features?.invoice_history?.enabled && c.features?.subscription_update?.enabled);
if (!portal) {
  portal = await stripe('POST', '/billing_portal/configurations', [
    ['business_profile[headline]', 'Watchdog partners with Stripe for staging billing'],
    ['features[customer_update][enabled]', 'true'],
    ['features[customer_update][allowed_updates][]', 'email'],
    ['features[customer_update][allowed_updates][]', 'address'],
    ['features[invoice_history][enabled]', 'true'],
    ['features[payment_method_update][enabled]', 'true'],
    ['features[subscription_cancel][enabled]', 'true'],
    ['features[subscription_cancel][mode]', 'at_period_end'],
    ['features[subscription_cancel][proration_behavior]', 'none'],
    ['features[subscription_update][enabled]', 'true'],
    ['features[subscription_update][default_allowed_updates][]', 'price'],
    ['features[subscription_update][proration_behavior]', 'always_invoice']
  ]);
}
assert(portal.livemode === false, 'Billing Portal configuration unexpectedly reports livemode=true.');
result.portal = { id: portal.id, active: portal.active };

fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), { mode: 0o600 });
console.log('Stripe staging provisioned safely in test/Sandbox mode.');
console.log(`Products: ${Object.keys(result.products).length}; prices: ${Object.keys(result.prices).length}; webhook: ${result.webhook.id}; portal: ${result.portal.id}.`);
console.log(`Sensitive provisioning output written to ${outputPath}; webhook secret was not printed.`);
