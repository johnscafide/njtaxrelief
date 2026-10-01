import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// First-use card trial contract. Owner decision 2026-10-01 replaced the
// controlled seven-day, no-card, Agent-only trial with a 14-day trial on every
// paid plan, card required, renewing automatically unless canceled. The trial
// still follows the same server-owned release control as any paid checkout.
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const checkout = fs.readFileSync(path.join(root, 'supabase/functions/create-checkout-session/index.ts'), 'utf8');
const webhook = fs.readFileSync(path.join(root, 'supabase/functions/stripe-webhook/index.ts'), 'utf8');

// Offer shape.
assert.match(checkout, /CARD_TRIAL\s*=\s*\{\s*offer:\s*'watchdog_14d_card_v1',\s*days:\s*14\s*\}/, 'trial must be the governed 14-day card offer');
assert.match(checkout, /trial_period_days:\s*CARD_TRIAL\.days/, 'Stripe subscription must own the trial clock');
assert.match(checkout, /payment_method_collection:\s*'always'/, 'the card trial must collect a payment method up front');
assert.match(checkout, /missing_payment_method:\s*'cancel'/, 'a trial must cancel if no payment method exists at trial end');
assert.match(checkout, /custom_text:\s*\{\s*submit:\s*\{\s*message:\s*trialTerms\(/, 'Checkout must state the trial and renewal terms in plain words');
assert.match(checkout, /renews automatically at \$\{price\}/, 'trial terms must name the renewal price');
assert.match(checkout, /Cancel anytime before \$\{endDate\}/, 'trial terms must say how to avoid the charge');

// One trial per account, decided only from webhook-written subscription history.
assert.match(checkout, /const trialEligible = !entitlement\?\.provider_subscription_id;/, 'accounts with subscription history must not receive another trial');
assert.match(checkout, /trialMode === 'required' && !trialEligible[\s\S]{0,200}TRIAL_ALREADY_USED/, 'a trial button must never turn into an immediate charge for an ineligible account');
assert.match(checkout, /billing\.trial_checkout_created/, 'trial checkout creation must be auditable');

// The release gate is unchanged and still governs trials.
assert.match(checkout, /if \(control\.mode === 'closed'\) return json/, 'closed checkout must reject every checkout, trials included');
assert.match(checkout, /control\.mode === 'controlled' && !control\.controlledUsers\.has\(user\.id\)/, 'controlled checkout must stay limited to listed accounts');
assert.match(checkout, /control\.mode === 'open' && !control\.liveGatePassed/, 'open checkout must still require the passed Live billing gate');
assert.doesNotMatch(checkout, /CONTROLLED_TRIAL_UNAVAILABLE/, 'the retired controlled-only trial rule must not linger');

// Entitlement is still written only by the signed webhook.
assert.doesNotMatch(checkout, /from\('account_entitlements'\)[\s\S]{0,120}\.upsert\(/, 'Checkout must never grant paid entitlement directly');
assert.match(webhook, /\['trialing',\s*'active',\s*'past_due'/, 'Stripe webhook must recognize trialing subscription state');
assert.match(webhook, /from\('account_entitlements'\)\.upsert\(next/, 'signed Stripe webhook must remain the entitlement writer');

console.log('card trial contract: PASS');
