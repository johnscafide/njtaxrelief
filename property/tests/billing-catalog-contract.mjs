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

const expected = {
  agent: { monthly: 59, yearly: 590, monthlyId: 'price_1U5qPZAgYeNIcesFuC2gKGTz', yearlyId: 'price_1U5qPjAgYeNIcesFCXaHoU0c' },
  pro: { monthly: 129, yearly: 1290, monthlyId: 'price_1U5qPyAgYeNIcesFy57ssZsV', yearlyId: 'price_1U5qQAAgYeNIcesF6UOsmwAX' },
  pro_plus: { monthly: 399, yearly: 3990, monthlyId: 'price_1U5qQKAgYeNIcesFmQqrWROC', yearlyId: 'price_1U5qQUAgYeNIcesFOSN8JZjR' }
};

for (const [tier, price] of Object.entries(expected)) {
  expect(catalog.includes(`${tier}: {`) || catalog.includes(`${tier}:\n`), `Public billing catalog is missing ${tier}.`);
  expect(catalog.includes(`monthly: { amount: ${price.monthly},`), `Public billing catalog ${tier} monthly amount drifted from $${price.monthly}.`);
  expect(catalog.includes(`yearly: { amount: ${price.yearly},`), `Public billing catalog ${tier} yearly amount drifted from $${price.yearly}.`);

  expect(account.includes(`internal: '${tier}'`), `Account card is not mapped to the ${tier} server tier.`);
  expect(account.includes(`monthly: ${price.monthly}`), `Account fallback ${tier} monthly amount drifted.`);
  expect(account.includes(`yearly: ${price.yearly}`), `Account fallback ${tier} yearly amount drifted.`);

  expect(webhook.includes(price.monthlyId), `Stripe webhook is missing the accepted ${tier} monthly Live Price ID.`);
  expect(webhook.includes(price.yearlyId), `Stripe webhook is missing the accepted ${tier} yearly Live Price ID.`);
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
expect(checkout.includes("return 'closed';"), 'Checkout no longer defaults fail-closed.');
expect(checkout.includes("WATCHDOG_TEST_NO_REAL_SPEND"), 'Checkout no longer protects test accounts from Live spend.');

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

console.log('Billing catalog contract passed: Account, Pro, Stripe mapping and fail-closed Checkout agree.');