import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

const catalog = read('supabase/functions/billing-price-catalog/index.ts');
const account = read('property/js/account.js');
const accountSync = read('property/js/account-billing-catalog.js');
const pro = read('property/pro/index.html');
const billingClient = read('property/js/billing-client.js');
const checkout = read('supabase/functions/create-checkout-session/index.ts');
const webhook = read('supabase/functions/stripe-webhook/index.ts');
const health = read('supabase/functions/get-platform-health/index.ts');
const onboarding = read('property/js/onboarding.js');
const onboardingPlans = read('property/css/onboarding-plans.css');

const expected = {
  agent: {
    monthly: 59, yearly: 590,
    monthlyCents: 5900, yearlyCents: 59000,
    monthlyLookup: 'watchdog_agent_monthly', yearlyLookup: 'watchdog_agent_yearly',
    monthlyId: 'price_1U5qPZAgYeNIcesFuC2gKGTz', yearlyId: 'price_1U5qPjAgYeNIcesFCXaHoU0c'
  },
  pro: {
    monthly: 129, yearly: 1290,
    monthlyCents: 12900, yearlyCents: 129000,
    monthlyLookup: 'watchdog_pro_monthly', yearlyLookup: 'watchdog_pro_yearly',
    monthlyId: 'price_1U5qPyAgYeNIcesFy57ssZsV', yearlyId: 'price_1U5qQAAgYeNIcesF6UOsmwAX'
  },
  pro_plus: {
    monthly: 399, yearly: 3990,
    monthlyCents: 39900, yearlyCents: 399000,
    monthlyLookup: 'watchdog_pro_plus_monthly', yearlyLookup: 'watchdog_pro_plus_yearly',
    monthlyId: 'price_1U5qQKAgYeNIcesFmQqrWROC', yearlyId: 'price_1U5qQUAgYeNIcesFOSN8JZjR'
  }
};

for (const [tier, price] of Object.entries(expected)) {
  expect(catalog.includes(`${tier}: {`) || catalog.includes(`${tier}:\n`), `Public billing catalog is missing ${tier}.`);
  expect(catalog.includes(`monthly: { amount: ${price.monthly}, lookup_key: '${price.monthlyLookup}' }`), `Public billing catalog ${tier} monthly contract drifted.`);
  expect(catalog.includes(`yearly: { amount: ${price.yearly}, lookup_key: '${price.yearlyLookup}' }`), `Public billing catalog ${tier} yearly contract drifted.`);

  expect(account.includes(`internal: '${tier}'`), `Account card is not mapped to the ${tier} server tier.`);
  expect(account.includes(`monthly: ${price.monthly}`), `Account fallback ${tier} monthly amount drifted.`);
  expect(account.includes(`yearly: ${price.yearly}`), `Account fallback ${tier} yearly amount drifted.`);

  expect(checkout.includes(`lookup_key: '${price.monthlyLookup}', amount: ${price.monthlyCents}`), `Checkout ${tier} monthly lookup/amount contract drifted.`);
  expect(checkout.includes(`lookup_key: '${price.yearlyLookup}', amount: ${price.yearlyCents}`), `Checkout ${tier} yearly lookup/amount contract drifted.`);
  expect(health.includes(`['${price.monthlyLookup}', ${price.monthlyCents}, 'month']`), `Health ${tier} monthly catalog validation drifted.`);
  expect(health.includes(`['${price.yearlyLookup}', ${price.yearlyCents}, 'year']`), `Health ${tier} yearly catalog validation drifted.`);

  expect(webhook.includes(price.monthlyId), `Stripe webhook is missing the accepted ${tier} monthly Live Price ID.`);
  expect(webhook.includes(price.yearlyId), `Stripe webhook is missing the accepted ${tier} yearly Live Price ID.`);
  expect(!checkout.includes(price.monthlyId), `Checkout hard-coded the Live ${tier} monthly Price ID instead of resolving by environment.`);
  expect(!checkout.includes(price.yearlyId), `Checkout hard-coded the Live ${tier} yearly Price ID instead of resolving by environment.`);
}

expect(accountSync.includes('/functions/v1/billing-price-catalog'), 'Account does not load the server billing catalog.');
expect(accountSync.includes("payload.provider !== 'stripe'"), 'Account billing catalog sync does not validate the Stripe provider boundary.');

expect(pro.includes('Agent $59/mo, Pro $129/mo and Pro+ $399/mo.'), 'Pro page monthly summary no longer matches the accepted catalog.');
expect(pro.includes('Agent is $590/year, Pro is $1,290/year and Pro+ is $3,990/year.'), 'Pro page yearly FAQ no longer matches the accepted catalog.');
expect(pro.includes('Monthly pricing is $59 for Agent, $129 for Pro and $399 for Pro+.'), 'Pro page monthly FAQ no longer matches the accepted catalog.');

expect(billingClient.includes("if(x==='agent')return{tier:'agent',plan:'agent'}"), 'Billing client Agent mapping drifted.');
expect(billingClient.includes("if(x==='pro')return{tier:'pro',plan:'pro'}"), 'Billing client Pro mapping drifted.');
expect(billingClient.includes("if(x==='pro_plus'||x==='pro+')return{tier:'pro_plus',plan:'pro_plus'}"), 'Billing client Pro+ mapping drifted.');

expect(checkout.includes("['agent', 'pro', 'pro_plus', 'pro+']"), 'Checkout accepted-tier contract drifted.');
expect(checkout.includes("if (rawTier === 'teams')"), 'Checkout no longer explicitly gates Teams enrollment.');
expect(checkout.includes("mode: envMode || gateMode || 'closed'"), 'Checkout no longer defaults fail-closed through server release control.');
expect(checkout.includes(".eq('gate_key', 'live_billing_lifecycle')"), 'Checkout is not reading the server-owned Live billing release gate.');
expect(checkout.includes("control.mode === 'open' && !control.liveGatePassed"), 'Checkout can open publicly without the Live billing gate passing.');
expect(checkout.includes('controlled_user_ids'), 'Checkout no longer supports the server-owned controlled user allowlist.');
expect(checkout.includes('environment_override'), 'Checkout no longer preserves an emergency environment override path.');
expect(checkout.includes("WATCHDOG_TEST_NO_REAL_SPEND"), 'Checkout no longer protects test accounts from Live spend.');
expect(checkout.includes('stripe.prices.list'), 'Checkout no longer resolves its active environment catalog through Stripe.');
expect(checkout.includes('matches.length !== 1'), 'Checkout no longer fails closed when a Stripe lookup key is ambiguous.');

expect(health.includes("provider: 'stripe'"), 'Developer platform health is not Stripe-authoritative.');
expect(health.includes("from('billing_webhook_events')"), 'Developer platform health is not reading the Stripe webhook ledger.');
expect(health.includes(".eq('gate_key', 'live_billing_lifecycle')"), 'Developer platform health is not tied to the Live billing release gate.');
expect(health.includes('stripe_secret_configured'), 'Developer platform health does not report Stripe secret readiness.');
expect(health.includes('webhook_secret_configured'), 'Developer platform health does not report webhook-secret readiness.');
expect(health.includes('catalog_lookup_resolved'), 'Developer platform health does not report server-side Stripe catalog resolution.');
expect(health.includes("stripeCatalog.mode === 'live'"), 'Developer platform health does not require a Live Stripe key for production acceptance.');
expect(health.includes('checkout_control_source'), 'Developer platform health does not expose safe Checkout control provenance.');
expect(health.includes('controlled_user_count'), 'Developer platform health does not report controlled allowlist readiness.');
expect(!health.includes('PADDLE_ENVIRONMENT'), 'Developer platform health reverted to Paddle environment detection.');
expect(!health.includes("eq('provider', 'paddle')"), 'Developer platform health reverted to Paddle event evidence.');

expect(onboarding.includes("complete_my_watchdog_onboarding_v2"), 'Onboarding no longer persists its required survey before membership selection.');
expect(onboarding.includes("await showPlanSelection();"), 'Onboarding no longer transitions from saved profile data into first-run membership selection.');
expect(onboarding.includes("/functions/v1/billing-price-catalog"), 'Onboarding does not load prices from the server-owned Stripe billing catalog.');
expect(onboarding.includes("['agent','pro','pro_plus'].map(planCard)"), 'Onboarding paid-first plan set or ordering drifted.');
expect(onboarding.indexOf("wd-plan-grid") < onboarding.indexOf("wd-plan-free"), 'Onboarding no longer renders paid plans before the Free option.');
expect(onboarding.includes("db.functions.invoke('create-checkout-session'"), 'Onboarding paid CTA no longer uses the authenticated server checkout function.');
expect(onboarding.includes("BILLING_ENROLLMENT_CLOSED"), 'Onboarding no longer handles the fail-closed billing release state cleanly.');
expect(onboarding.includes("Continue with Free"), 'Onboarding no longer preserves a no-card Free continuation path.');
expect(onboarding.includes("runtime.cleanRoutes"), 'Onboarding next-route handling is not aware of clean WatchdogIndex routes.');
expect(!onboarding.includes('monthly: 59'), 'Onboarding hard-coded Agent catalog pricing instead of loading it from the server catalog.');
expect(!onboarding.includes('monthly: 129'), 'Onboarding hard-coded Pro catalog pricing instead of loading it from the server catalog.');
expect(!onboarding.includes('monthly: 399'), 'Onboarding hard-coded Pro+ catalog pricing instead of loading it from the server catalog.');
expect(onboardingPlans.includes('grid-template-columns:repeat(3,minmax(0,1fr))'), 'Onboarding paid plan layout lost its desktop three-plan presentation.');
expect(onboardingPlans.includes('@media(max-width:700px)'), 'Onboarding plan selection lost its mobile layout contract.');
expect(onboardingPlans.includes('.wd-intelligence-brand-word'), 'Onboarding plan selection lost Watchdog Intelligence brand treatment.');

expect(!account.includes('monthly: 29'), 'Legacy Agent $29 pricing returned to Account.');
expect(!account.includes('yearly: 290'), 'Legacy Agent $290 yearly pricing returned to Account.');
expect(!account.includes('monthly: 349'), 'Legacy Professional $349 pricing returned to Account.');
expect(!account.includes('yearly: 3490'), 'Legacy Professional $3,490 yearly pricing returned to Account.');
expect(!account.includes("internal: 'pro',\n      name: 'Agent'"), 'Legacy Agent -> Pro entitlement mapping returned.');
expect(!account.includes("name: 'Professional'"), 'Legacy two-tier Professional card returned to Account.');
expect(!account.includes('Paddle is confirming'), 'Paddle-era Account success copy returned.');
expect(!account.includes('Paid access changes only after Paddle'), 'Paddle-era Account pricing note returned.');

if (failures.length) {
  console.error('Billing catalog contract failed:');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Billing catalog contract passed: Account, Pro, onboarding, Stripe lookup resolution, server-owned release control, launch health and fail-closed Checkout agree.');