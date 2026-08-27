import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const checkout = fs.readFileSync(path.join(root, 'supabase/functions/create-checkout-session/index.ts'), 'utf8');
const webhook = fs.readFileSync(path.join(root, 'supabase/functions/stripe-webhook/index.ts'), 'utf8');

assert.match(checkout, /CONTROLLED_AGENT_TRIAL\s*=\s*\{\s*offer:\s*'controlled_agent_7d_v1',\s*days:\s*7\s*\}/, 'trial must remain a governed seven-day offer');
assert.match(checkout, /controlledTrial\s*&&\s*control\.mode\s*!==\s*'controlled'/, 'trial must fail outside controlled checkout mode');
assert.match(checkout, /controlledTrial\s*&&\s*tier\s*!==\s*'agent'/, 'trial must remain Agent-only');
assert.match(checkout, /controlledTrial\s*\?\s*'monthly'/, 'trial must use the Agent monthly recurring price');
assert.match(checkout, /provider_subscription_id[\s\S]*CONTROLLED_TRIAL_NOT_ELIGIBLE/, 'accounts with subscription history must not receive a first-use trial');
assert.match(checkout, /billing\.controlled_agent_trial_checkout_created/, 'trial creation must be auditable and reusable as an anti-repeat signal');
assert.match(checkout, /trial_period_days:\s*CONTROLLED_AGENT_TRIAL\.days/, 'Stripe subscription must own the trial clock');
assert.match(checkout, /missing_payment_method:\s*'cancel'/, 'trial must cancel if no payment method exists at trial end');
assert.match(checkout, /payment_method_collection:\s*'if_required'/, 'trial must not require a payment method up front');
assert.doesNotMatch(checkout, /from\('account_entitlements'\)[\s\S]{0,120}\.upsert\(/, 'Checkout must never grant paid entitlement directly');
assert.match(webhook, /\['trialing',\s*'active',\s*'past_due'/, 'Stripe webhook must recognize trialing subscription state');
assert.match(webhook, /from\('account_entitlements'\)\.upsert\(next/, 'signed Stripe webhook must remain the entitlement writer');

console.log('controlled Agent trial contract: PASS');
