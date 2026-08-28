const fs = require('fs');
const path = require('path');

const runbookPath = path.join(__dirname, '..', 'property', 'docs', 'billing-support-runbook.md');
const text = fs.readFileSync(runbookPath, 'utf8');

const required = [
  'Stripe is the production payment provider for all new Watchdog subscriptions.',
  'Watchdog paid access changes only after a signed Stripe event is accepted, normalized and reconciled through the server-owned entitlement boundary.',
  'Do not build a second dunning engine in Watchdog.',
  'Public paid enrollment is still intentionally controlled by separate launch controls',
  'Teams self-service enrollment remains closed.',
  'Legacy Paddle evidence remains historical/compatibility evidence only',
  'Never store payment-card data, secret keys, webhook signing secrets or raw authentication tokens'
];

const forbidden = [
  /Paddle(?:'s| is| handles?) (?:job|responsibility|dunning|retry|retries)/i,
  /grant (?:the )?paid plan manually/i,
  /open public (?:paid )?enrollment/i,
  /manual entitlement override/i
];

const errors = [];
for (const phrase of required) {
  if (!text.includes(phrase)) errors.push(`missing required contract text: ${phrase}`);
}
for (const pattern of forbidden) {
  if (pattern.test(text)) errors.push(`forbidden stale/unsafe billing guidance matched: ${pattern}`);
}

if (errors.length) {
  console.error('Billing support runbook contract FAILED');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Billing support runbook contract passed.');
